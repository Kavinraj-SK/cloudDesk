variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "ap-south-1"  # Mumbai - closest to India
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "ec2_instance_type" {
  description = "EC2 instance type for backend"
  type        = string
  default     = "t3.small"
}

variable "key_pair_name" {
  description = "AWS key pair name for SSH access"
  type        = string
}

variable "allowed_ssh_cidr" {
  description = "CIDR block allowed for SSH access"
  type        = string
  default     = "0.0.0.0/0"
}

variable "db_username" {
  description = "PostgreSQL database username"
  type        = string
  default     = "clouddesk"
  sensitive   = true
}

variable "db_password" {
  description = "PostgreSQL database password"
  type        = string
  sensitive   = true
}

variable "github_username" {
  description = "GitHub username for container registry"
  type        = string
}
