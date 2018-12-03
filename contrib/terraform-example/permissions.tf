resource "aws_iam_role" "this" {
  name = "${local.lambda_function_name}_AllowLambdaExec"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
EOF
}

# This policy has 3 parts, which allow the TerraformMonitorLambda to:
# 1. Write logs from its execution to CloudWatch (this is usually the case for any Lambda)
# 2. Write custom CloudWatch metrics (because TerraformMonitorLambda supports both CloudWatch and InfluxDB as metrics sinks)
# 3. Read (and only read, not write) the Terraform state in S3
# Importantly, you'll note that even though our Terraform setup uses DynamoDB for state locking, we grant no DynamoDB permissions here, not even read-only ones.
# That's because the TerraformMonitorLambda doesn't need to lock the Terraform state when it runs its "terraform plan", so it doesn't need any DynamoDB access, so let's not give it any.
resource "aws_iam_policy" "this" {
  name = "${local.lambda_function_name}"
  path = "/"

  policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*",
      "Effect": "Allow"
    },
    {
      "Action": [
        "cloudwatch:PutMetricData"
      ],
      "Resource": "*",
      "Effect": "Allow"
    },
    {
      "Action": [
        "s3:Get*",
        "s3:List*"
      ],
      "Resource": [
        "arn:aws:s3:::${var.terraform_monitor_s3_bucket}",
        "arn:aws:s3:::${var.terraform_monitor_s3_bucket}/*"
      ],
      "Effect": "Allow"
    }
  ]
}
EOF
}

resource "aws_iam_role_policy_attachment" "this" {
  role       = "${aws_iam_role.this.name}"
  policy_arn = "${aws_iam_policy.this.arn}"
}
