# terraform-monitor-lambda

Monitors a Terraform repository and reports on [configuration drift](https://www.hashicorp.com/blog/detecting-and-managing-drift-with-terraform): changes that are in the repo, but not in the deployed infra, or vice versa. Hooks up to dashboards and alerts via [CloudWatch](https://aws.amazon.com/cloudwatch/) or [InfluxDB](https://docs.influxdata.com/influxdb/).

## Background

Terraform is a great tool for defining infrastructure as code. As the team working on the infra grows, however, it becomes more likely that someone forgets to push changes to version control which have already been applied to infrastructure. This will cause others to see differences on their next `terraform apply` which they have no knowledge of. Also, this will reduce the usefulness of your Terraform configuration as the documentation of your infrastructure, because whatever is currently deployed _does not necessarily match_ what's in your configuration.

## Requirements

This project will only be useful if you host your Terraform configuration in a repo on [GitHub](https://github.com/), and use Terraform with the [S3 backend](https://www.terraform.io/docs/backends/types/s3.html).

It will probably work with other VCS's & backend types with minor modifications, but your out-of-box experience will not be as smooth.

## Setup

### Setting up manually

1. Download the [latest release](https://github.com/jareware/terraform-monitor-lambda/releases)
1. Log into AWS Lambda
1. Create a new function from the release zipfile
1. Put in [configuration](#configuration) via environment variables
1. Grant [necessary IAM permissions](#TODO) for the Lambda user
1. Add an invocation schedule (e.g. once per hour)

### Setting up with Terraform

Because you're already sold on Terraform, setting up this project using Terraform probably sounds like a good idea! An [example setup](contrib/terraform-example) is included.

## Configuration

The Lambda function expects configuration via environment variables as follows:

```bash
# These should match the Terraform S3 backend configuration:
TERRAFORM_MONITOR_S3_BUCKET=my-bucket
TERRAFORM_MONITOR_S3_KEY=terraform

# GitHub repo which contains your Terraform files, and API token with access to it:
TERRAFORM_MONITOR_GITHUB_REPO=user/infra
TERRAFORM_MONITOR_GITHUB_TOKEN=123abc

# (Optional) AWS CloudWatch metric name to which metrics should be shipped:
TERRAFORM_MONITOR_CLOUDWATCH_NAMESPACE=TerraformMonitor

# (Optional) Configuration for an InfluxDB instance to which metrics should be shipped:
TERRAFORM_MONITOR_INFLUXDB_URL=https://db.example.com
TERRAFORM_MONITOR_INFLUXDB_DB=my_metrics
TERRAFORM_MONITOR_INFLUXDB_AUTH=user:pass
TERRAFORM_MONITOR_INFLUXDB_MEASUREMENT=terraform_monitor

# (Optional) AWS config for when running outside of Lambda:
AWS_SECRET_ACCESS_KEY=abcdef
AWS_ACCESS_KEY_ID=ABCDEF
AWS_REGION=eu-central-1
```

## Security

Your AWS account probably contains sensitive things. And understandably, you should be cautious of using code from a stranger on the Internet, when that code can have access to your whole infrastructure.

This project aims to alleviate those concerns in two ways.

### 1. Running with limited permissions

The Lambda function doesn't expect to have full privileges on the AWS account. To the contrary, it assumes a very limited set of permissions; the only required one is read-only access to the bucket that contains your Terraform state.

### 2. Simple to audit

The Lambda function is defined in a [single easy-to-read file](src/), in strictly-typed TypeScript. Also, it uses zero external dependencies from npm. The only other dependencies are Terraform itself, and the `aws-sdk` which is built in to the Lambda JS environment.

## Development

To get a standard development environment that matches Lambda's pretty well, consider using Docker:

```console
$ docker run --rm -it -v $(pwd):/app -w /app --env-file .env node:8.10.0 bash
> apt-get update && apt-get install -y zip
> ./node_modules/.bin/ts-node src/index.ts
```

See [above](#configuration) for an example `.env` file to use.

## Release

Releasing a new version is automated via a script, which asks a question (semver bump), and does the following:

```console
$ ./contrib/release.sh
Checking for clean working copy... OK
Parsing git remote... OK
Verifying GitHub API access... OK
Running pre-release QA tasks... OK
Building Lambda function... OK

This release is major/minor/patch: patch

Committing and tagging new release... OK
Pushing tag to GitHub... OK
Renaming release zipfile... OK
Creating release on GitHub... OK
Uploading release zipfile... OK
Cleaning up... OK

New release: https://github.com/jareware/terraform-monitor-lambda/releases/tag/v1.0.0
```
