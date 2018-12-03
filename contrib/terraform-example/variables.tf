variable "default_resource_comment" {
  description = "Comment which should be added to all resources we create"
}

variable "terraform_monitor_s3_bucket" {
  description = "Name of the S3 bucket where the AWS provider stores its state"
}

variable "terraform_monitor_s3_key" {
  description = "S3 key in which the AWS provider stores its state"
}

variable "terraform_monitor_github_repo" {
  description = "Full name of the GitHub repo (e.g. 'john-doe/terraform-infra') in which the Terraform project lives"
}

variable "terraform_monitor_github_token" {
  description = "A GitHub Personal Access Token (https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/) with read privileges on the Terraform repository"
}

variable "terraform_monitor_cloudwatch_namespace" {
  description = "If provided, Terraform metrics will be shipped to CloudWatch, under this namespace (e.g. 'TerraformMonitor')"
  default     = ""
}

variable "terraform_monitor_influxdb_url" {
  description = "If provided, Terraform metrics will be shipped to an InfluxDB instance at the given URL (e.g. 'https://my-influxdb.example.com/')"
  default     = ""
}

variable "terraform_monitor_influxdb_db" {
  description = "If shipping metrics to InfluxDB, use this database name (e.g. 'my_metrics_db')"
  default     = ""
}

variable "terraform_monitor_influxdb_auth" {
  description = "If shipping metrics to InfluxDB, use these credential (e.g. 'admin:secret')"
  default     = ""
}

variable "terraform_monitor_influxdb_measurement" {
  description = "If shipping metrics to InfluxDB, use this measurement name (e.g. 'terraform_monitor')"
  default     = ""
}

variable "terraform_monitor_schedule_expression" {
  description = "How often to run the Lambda (see https://docs.aws.amazon.com/AmazonCloudWatch/latest/events/ScheduledEvents.html)"
  default     = "rate(60 minutes)"
}
