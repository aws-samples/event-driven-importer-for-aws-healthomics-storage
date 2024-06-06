# /*********************************************************************************************************************
# *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.                                           *
# *                                                                                                                    *
# *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance    *
# *  with the License. A copy of the License is located at                                                             *
# *                                                                                                                    *
# *      http://www.apache.org/licenses/LICENSE-2.0                                                                    *
# *                                                                                                                    *
# *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES *
# *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
# *  and limitations under the License.                                                                                *
# *********************************************************************************************************************/

import itertools as it
import json
import os
from os import path
import re
from time import sleep

import boto3


# map of extensions to file sourceFileTypes
# FASTQs only
OMICS_FILE_TYPES = {
    '.fq.gz': 'FASTQ',
    '.fastq.gz': 'FASTQ'
}
MARKER_FILENAME = os.getenv('MARKER_FILENAME')
TARGET_SEQUENCE_STORE_ARN = os.getenv('TARGET_SEQUENCE_STORE_ARN')
TARGET_SEQUENCE_STORE_ID = TARGET_SEQUENCE_STORE_ARN.split('/')[1]
IMPORT_JOB_ROLE_ARN = os.getenv('IMPORT_JOB_ROLE_ARN')
FASTQ_FILE_PATTERN = '(.+)\\.R[12](\\..+)'


class FASTQManifest:
    # an object specific to building ReadSet source manifiests
    # for only FASTQ files
    _manifest: dict
    def __init__(self):
        self._manifest = dict()

    def add_source(self, file):
        # this is only for paired FASTQ files
        # check if the manifest already has a source of similar name
        #
        # expect that files have path name format of
        # /runid/Lane[1-9]/flowcellid_sampleid.R{1,2}.fq.gz
        # consider the full path name
        key = path.join(path.dirname(file), path.basename(file))
        key = re.sub(FASTQ_FILE_PATTERN, '\\1\\2', key) 

        if not self._manifest.get(key):
            subject_id, sample_id = get_subject_sample_ids(file)
            self._manifest[key] = {
                'sourceFiles': { 'source1': file },
                'sourceFileType': 'FASTQ',
                'subjectId': subject_id,
                'sampleId': sample_id,
                'name': key
            }
        else:
            self._manifest[key]['sourceFiles']['source2'] = file
    
    def get_manifest(self):
        return [item[1] for item in self._manifest.items()]
    
    @property
    def count(self):
        return len(self._manifest)


def get_subject_sample_ids(file):
    # expect that files have path name format of
    # /runid/Lane[1-9]/flowcellid_sampleid.R{1,2}.fq.gz

    key = path.basename(file)
    key = re.sub(FASTQ_FILE_PATTERN, '\\1', key)  # exclude the read number and file extension

    # here we'll use flowcellid as subjectid
    subject_id, sample_id, *_ = path.basename(key).split('_')
    return subject_id, sample_id


def get_import_manifest(bucket_name, prefix):
    s3r = boto3.resource('s3')

    bucket = s3r.Bucket(bucket_name)
    
    manifest = FASTQManifest()
    objects = bucket.objects.filter(Prefix=prefix)
    pattern = '|'.join(OMICS_FILE_TYPES.keys()).replace('.', '\\.')
    for obj in objects:
        if re.search(f"({pattern})$", obj.key):
            # note there is a limit on the number of files handled per manifest
            # we can handle that later with chunking operations
            print(f"adding object to import manifest: {obj}")
            manifest.add_source(as_s3uri(obj))
    
    return manifest


def as_s3uri(object_summary):
    return path.join(f's3://{object_summary.bucket_name}', object_summary.key)


def handler(event, context):
    # should return the import job id for good measure
    records = event['Records']
    manifests = []
    for record in records:

        bucket_name = record['s3']['bucket']['name']
        # only action on events triggered by marker files
        marker_key = record['s3']['object']['key']
        if path.basename(marker_key) == MARKER_FILENAME:
            # parse the path for the parent folder
            # list all objects in the parent folder
            manifests += [get_import_manifest(bucket_name, path.dirname(marker_key))]
    
    omics = boto3.client('omics')
    import_job_ids = []
    for manifest in manifests:
        # check source length, split if >100 (hard limit)
        # create ReadSet import jobs
        batches = it.batched(manifest.get_manifest(), 100)
        for batch in batches:
            # TODO: add retries with exponential backoff in case of failure (e.g. from throttling)
            response = omics.start_read_set_import_job(
                sequenceStoreId=TARGET_SEQUENCE_STORE_ID,
                roleArn=IMPORT_JOB_ROLE_ARN,
                sources = batch
            )
            import_job_ids += [response['id']]
            print(f"started read set import job: {response['id']}")
            sleep(0.2)  # throttle to 5 TPS


    return {
        'statusCode': 200,
        'body': json.dumps({
            "event": event,
            "sequenceStore": TARGET_SEQUENCE_STORE_ARN,
            "import_job_ids": import_job_ids,
        }),
    }

