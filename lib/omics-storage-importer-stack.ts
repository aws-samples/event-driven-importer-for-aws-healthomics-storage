/*********************************************************************************************************************
*  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.                                           *
*                                                                                                                    *
*  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance    *
*  with the License. A copy of the License is located at                                                             *
*                                                                                                                    *
*      http://www.apache.org/licenses/LICENSE-2.0                                                                    *
*                                                                                                                    *
*  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES *
*  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
*  and limitations under the License.                                                                                *
*********************************************************************************************************************/

import path = require('path');

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as omics from 'aws-cdk-lib/aws-omics';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface OmicsStorageImporterStackProps extends cdk.StackProps {
  bucketArn: string,
  markerFileName?: string, // default: "progress.AWS"
  seqStoreArn?: string,
}

export class OmicsStorageImporterStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: OmicsStorageImporterStackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // example resource
    // const queue = new sqs.Queue(this, 'OmicsStorageImporterQueue', {
    //   visibilityTimeout: cdk.Duration.seconds(300)
    // });

    let markerFileName: string = 'progress.AWS'
    if (props.markerFileName) {
      markerFileName = props.markerFileName;
    }

    const fnStartImport = new lambda.Function(this, 'omicsStartImportFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset(path.join(__dirname, 'lambda/aho_start_storage_import')),
      handler: 'handler.handler',
      timeout: cdk.Duration.minutes(5)
    });

    fnStartImport.addEnvironment('MARKER_FILENAME', markerFileName);

    const bucket = s3.Bucket.fromBucketAttributes(this, 'monitoredBucket', { bucketArn: props.bucketArn });
    bucket.addObjectCreatedNotification(
      new s3n.LambdaDestination(fnStartImport),
      {
        suffix: markerFileName
      }
    )

    let targetSeqStoreArn: string;
    if (props.seqStoreArn) {
      targetSeqStoreArn = props.seqStoreArn
    } else {
      const targetSeqStore = new omics.CfnSequenceStore(this, 'targetSequenceStore', {
        name: 'demo-flowcell-data',
      });
      targetSeqStoreArn = targetSeqStore.attrArn
    }
    fnStartImport.addEnvironment('TARGET_SEQUENCE_STORE_ARN', targetSeqStoreArn)

    const importJobRole = new iam.Role(this, 'importJobRole', {
      assumedBy: new iam.ServicePrincipal('omics.amazonaws.com'),
      inlinePolicies: {
        's3-access': new iam.PolicyDocument({
          statements: [new iam.PolicyStatement({
            actions: [
              's3:GetBucketLocation',
              's3:GetObject',
              's3:ListBucket',
            ],
            resources: [
              props.bucketArn,
              props.bucketArn + "*/*"
            ]
          })]
        })
      }
    });
    fnStartImport.addEnvironment('IMPORT_JOB_ROLE_ARN', importJobRole.roleArn)

    fnStartImport.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        's3:GetBucketLocation',
        's3:GetObject',
        's3:ListBucket',
      ],
      resources: [
        props.bucketArn,
        props.bucketArn + "*/*"
      ]
    }));
    fnStartImport.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'iam:PassRole'
      ],
      resources: [
        importJobRole.roleArn
      ]
    }));
    fnStartImport.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'omics:StartReadSetImportJob'
      ],
      resources: [
        targetSeqStoreArn,
        targetSeqStoreArn + "/readSet/*"
      ]
    }))


  }
}
