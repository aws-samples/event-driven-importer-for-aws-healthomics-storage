#!/usr/bin/env node

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

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OmicsStorageImporterStack } from '../lib/omics-storage-importer-stack';

const app = new cdk.App();

console.log("bucketArn: " + app.node.tryGetContext('bucketArn'))
console.log("markerFileName: " + app.node.tryGetContext('markerFileName'))
console.log("seqStoreArn: " + app.node.tryGetContext('seqStoreArn'))

new OmicsStorageImporterStack(app, 'OmicsStorageImporterStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  bucketArn: app.node.tryGetContext('bucketArn'),
  markerFileName: app.node.tryGetContext('markerFileName'),
  seqStoreArn: app.node.tryGetContext('seqStoreArn')
});