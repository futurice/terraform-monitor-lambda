locals {
  lambda_function_name = "TerraformMonitor"
  lambda_zipfile_name  = "terraform-monitor-lambda-v1.2.0.zip" # see https://github.com/jareware/terraform-monitor-lambda/releases
}

resource "aws_lambda_function" "this" {
  function_name    = "${local.lambda_function_name}"
  filename         = "${substr("${path.module}/${local.lambda_zipfile_name}", length(path.cwd) + 1, -1)}" # see https://github.com/hashicorp/terraform/issues/7613#issuecomment-332238441
  source_code_hash = "${base64sha256(file("${path.module}/${local.lambda_zipfile_name}"))}"
  handler          = "index.handler"
  timeout          = 600                                                                                  # 10 minutes
  memory_size      = 512                                                                                  # running big external binaries like Terraform's needs a bit more memory
  runtime          = "nodejs8.10"
  role             = "${aws_iam_role.this.arn}"
  description      = "${var.default_resource_comment}"

  environment {
    variables = {
      TERRAFORM_MONITOR_S3_BUCKET = "${var.terraform_monitor_s3_bucket}"
      TERRAFORM_MONITOR_S3_KEY    = "${var.terraform_monitor_s3_key}"

      TERRAFORM_MONITOR_GITHUB_REPO  = "${var.terraform_monitor_github_repo}"
      TERRAFORM_MONITOR_GITHUB_TOKEN = "${var.terraform_monitor_github_token}"

      TERRAFORM_MONITOR_CLOUDWATCH_NAMESPACE = "${var.terraform_monitor_cloudwatch_namespace}"

      TERRAFORM_MONITOR_INFLUXDB_URL         = "${var.terraform_monitor_influxdb_url}"
      TERRAFORM_MONITOR_INFLUXDB_DB          = "${var.terraform_monitor_influxdb_db}"
      TERRAFORM_MONITOR_INFLUXDB_AUTH        = "${var.terraform_monitor_influxdb_auth}"
      TERRAFORM_MONITOR_INFLUXDB_MEASUREMENT = "${var.terraform_monitor_influxdb_measurement}"
    }
  }
}

# Add the scheduled execution rules & permissions:

resource "aws_cloudwatch_event_rule" "this" {
  name                = "${local.lambda_function_name}_InvocationSchedule"
  schedule_expression = "${var.terraform_monitor_schedule_expression}"
}

resource "aws_cloudwatch_event_target" "this" {
  rule      = "${aws_cloudwatch_event_rule.this.name}"
  target_id = "${aws_cloudwatch_event_rule.this.name}"
  arn       = "${aws_lambda_function.this.arn}"
}

resource "aws_lambda_permission" "this" {
  statement_id  = "${local.lambda_function_name}_ScheduledInvocation"
  action        = "lambda:InvokeFunction"
  function_name = "${aws_lambda_function.this.function_name}"
  principal     = "events.amazonaws.com"
  source_arn    = "${aws_cloudwatch_event_rule.this.arn}"
}
