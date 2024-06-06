#!/usr/bin/env node
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