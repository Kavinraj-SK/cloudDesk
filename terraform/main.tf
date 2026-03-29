terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket = "clouddesk-terraform-state"
    key    = "clouddesk/terraform.tfstate"
    region = "ap-south-1"
  }
}

provider "aws" {
  region = var.aws_region
}

# ─── VPC ─────────────────────────────────────────────────────────
resource "aws_vpc" "clouddesk" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = { Name = "clouddesk-vpc", Project = "clouddesk" }
}

resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.clouddesk.id
  cidr_block        = "10.0.${count.index}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true
  tags = { Name = "clouddesk-public-${count.index}", Project = "clouddesk" }
}

data "aws_availability_zones" "available" { state = "available" }

resource "aws_internet_gateway" "clouddesk" {
  vpc_id = aws_vpc.clouddesk.id
  tags   = { Name = "clouddesk-igw" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.clouddesk.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.clouddesk.id
  }
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ─── Security Groups ─────────────────────────────────────────────
resource "aws_security_group" "backend" {
  name   = "clouddesk-backend-sg"
  vpc_id = aws_vpc.clouddesk.id

  ingress { from_port = 4000; to_port = 4000; protocol = "tcp"; cidr_blocks = ["0.0.0.0/0"] }
  ingress { from_port = 22;   to_port = 22;   protocol = "tcp"; cidr_blocks = [var.allowed_ssh_cidr] }
  egress  { from_port = 0;    to_port = 0;    protocol = "-1";  cidr_blocks = ["0.0.0.0/0"] }
  tags = { Name = "clouddesk-backend-sg" }
}

# ─── EC2 for Backend ─────────────────────────────────────────────
resource "aws_instance" "backend" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.ec2_instance_type
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.backend.id]
  key_name               = var.key_pair_name

  user_data = <<-EOF
    #!/bin/bash
    apt-get update -y
    apt-get install -y docker.io docker-compose-v2
    systemctl enable docker
    systemctl start docker
    usermod -aG docker ubuntu

    # Pull and run CloudDesk backend
    docker pull ghcr.io/${var.github_username}/clouddesk-backend:latest
    docker run -d \
      --name clouddesk-backend \
      -p 4000:4000 \
      --restart unless-stopped \
      -e NODE_ENV=production \
      -e POSTGRES_HOST=${aws_db_instance.postgres.address} \
      -e POSTGRES_DB=clouddesk \
      -e POSTGRES_USER=${var.db_username} \
      -e POSTGRES_PASSWORD=${var.db_password} \
      -e REDIS_HOST=${aws_elasticache_cluster.redis.cache_nodes[0].address} \
      ghcr.io/${var.github_username}/clouddesk-backend:latest
  EOF

  tags = { Name = "clouddesk-backend", Project = "clouddesk" }
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]
  filter { name = "name"; values = ["ubuntu/images/hvm-ssd/ubuntu-22.04-amd64-server-*"] }
  filter { name = "virtualization-type"; values = ["hvm"] }
}

# ─── RDS PostgreSQL ──────────────────────────────────────────────
resource "aws_db_instance" "postgres" {
  identifier        = "clouddesk-postgres"
  engine            = "postgres"
  engine_version    = "16"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
  db_name           = "clouddesk"
  username          = var.db_username
  password          = var.db_password
  skip_final_snapshot = true
  publicly_accessible = false
  vpc_security_group_ids = [aws_security_group.backend.id]
  db_subnet_group_name   = aws_db_subnet_group.clouddesk.name
  tags = { Name = "clouddesk-rds", Project = "clouddesk" }
}

resource "aws_db_subnet_group" "clouddesk" {
  name       = "clouddesk-db-subnet"
  subnet_ids = aws_subnet.public[*].id
}

# ─── ElastiCache Redis ───────────────────────────────────────────
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "clouddesk-redis"
  engine               = "redis"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.clouddesk.name
  tags = { Name = "clouddesk-redis", Project = "clouddesk" }
}

resource "aws_elasticache_subnet_group" "clouddesk" {
  name       = "clouddesk-cache-subnet"
  subnet_ids = aws_subnet.public[*].id
}

# ─── S3 Bucket for Frontend Static Hosting ───────────────────────
resource "aws_s3_bucket" "frontend" {
  bucket = "clouddesk-frontend-${var.environment}"
  tags   = { Name = "clouddesk-frontend", Project = "clouddesk" }
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  index_document { suffix = "index.html" }
  error_document  { key = "index.html" }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}
