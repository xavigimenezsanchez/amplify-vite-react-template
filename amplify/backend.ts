import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import { RemovalPolicy } from "aws-cdk-lib";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from "aws-cdk-lib/aws-iam";

import * as osis from "aws-cdk-lib/aws-osis";
import * as logs from "aws-cdk-lib/aws-logs";
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from "./storage/resource";

const backend = defineBackend({
  auth,
  data,
  storage,
});

const articlesTable = backend.data.resources.cfnResources.amplifyDynamoDbTables["Articles"];

//Update table settings
articlesTable.pointInTimeRecoveryEnabled = true;

articlesTable.streamSpecification = {
  streamViewType: dynamodb.StreamViewType.NEW_IMAGE
}

const tableArn = backend.data.resources.tables['Articles'].tableArn;

const tableName = backend.data.resources.tables['Articles'].tableName;

const openSearchDomain = new opensearch.Domain(
  backend.data.stack,
  'OpenSearchDomain',
  {
    version: opensearch.EngineVersion.OPENSEARCH_1_3,
    capacity: {
      masterNodeInstanceType: "t3.small.search",
      masterNodes: 0,
      dataNodeInstanceType: "t3.small.search",
      dataNodes: 1,
    },
    nodeToNodeEncryption: true,
    removalPolicy: RemovalPolicy.DESTROY,
    encryptionAtRest: {
      enabled: true,
    }
    }
)


// Get the S3Bucket ARN
const s3BucketArn = backend.storage.resources.bucket.bucketArn;
// Get the S3Bucket Name
const s3BucketName = backend.storage.resources.bucket.bucketName;


// Create an IAM role for OpenSearch integration
const openSearchIntegrationPipelineRole = new iam.Role(
  backend.data.stack,
  "OpenSearchIntegrationPipelineRole",
  {
    assumedBy: new iam.ServicePrincipal("osis-pipelines.amazonaws.com"),
    inlinePolicies: {
      openSearchPipelinePolicy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            actions: ["es:DescribeDomain"],
            resources: [
              openSearchDomain.domainArn,
              openSearchDomain.domainArn + "/*",
            ],
            effect: iam.Effect.ALLOW,
          }),
          new iam.PolicyStatement({
            actions: ["es:ESHttp*"],
            resources: [
              openSearchDomain.domainArn,
              openSearchDomain.domainArn + "/*",
            ],
            effect: iam.Effect.ALLOW,
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              "s3:GetObject",
              "s3:AbortMultipartUpload",
              "s3:PutObject",
              "s3:PutObjectAcl",
            ],
            resources: [s3BucketArn, s3BucketArn + "/*"],
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
              "dynamodb:DescribeTable",
              "dynamodb:DescribeContinuousBackups",
              "dynamodb:ExportTableToPointInTime",
              "dynamodb:DescribeExport",
              "dynamodb:DescribeStream",
              "dynamodb:GetRecords",
              "dynamodb:GetShardIterator",
            ],
            resources: [tableArn, tableArn + "/*"],
          }),
        ],
      }),
    },
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonOpenSearchIngestionFullAccess"
      ),
    ],
  }
);



// Define OpenSearch index mappings
const indexName = "section";


const indexMapping = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
  },
  mappings: {
    properties: {
      id: {
        type: "keyword",
      },
      issue: {
        type: "boolean",
      },
      author: {
        type: "text",
      },
    },
  },
};





// OpenSearch template definition
const openSearchTemplate = `
version: "2"
dynamodb-pipeline:
  source:
    dynamodb:
      acknowledgments: true
      tables:
        - table_arn: "${tableArn}"
          stream:
            start_position: "LATEST"
          export:
            s3_bucket: "${s3BucketName}"
            s3_region: "${backend.storage.stack.region}"
            s3_prefix: "${tableName}/"
      aws:
        sts_role_arn: "${openSearchIntegrationPipelineRole.roleArn}"
        region: "${backend.data.stack.region}"
  sink:
    - opensearch:
        hosts:
          - "https://${openSearchDomain.domainEndpoint}"
        index: "${indexName}"
        index_type: "custom"
        template_content: |
          ${JSON.stringify(indexMapping)}
        document_id: '\${getMetadata("primary_key")}'
        action: '\${getMetadata("opensearch_action")}'
        document_version: '\${getMetadata("document_version")}'
        document_version_type: "external"
        bulk_size: 4
        aws:
          sts_role_arn: "${openSearchIntegrationPipelineRole.roleArn}"
          region: "${backend.data.stack.region}"
`;




// Create a CloudWatch log group
const logGroup = new logs.LogGroup(backend.data.stack, "LogGroup", {
  logGroupName: "/aws/vendedlogs/OpenSearchService/pipelines/1",
  removalPolicy: RemovalPolicy.DESTROY,
});


// Create an OpenSearch Integration Service pipeline
const cfnPipeline = new osis.CfnPipeline(
  backend.data.stack,
  "OpenSearchIntegrationPipeline",
  {
    maxUnits: 4,
    minUnits: 1,
    pipelineConfigurationBody: openSearchTemplate,
    pipelineName: "dynamodb-integration-2",
    logPublishingOptions: {
      isLoggingEnabled: true,
      cloudWatchLogDestination: {
        logGroup: logGroup.logGroupName,
      },
    },
  }
);