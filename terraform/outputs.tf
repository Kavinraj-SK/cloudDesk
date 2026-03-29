output "backend_public_ip" {
  description = "Public IP of the backend EC2 instance"
  value       = aws_instance.backend.public_ip
}

output "backend_url" {
  description = "Backend API URL"
  value       = "http://${aws_instance.backend.public_ip}:4000"
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = aws_db_instance.postgres.address
  sensitive   = true
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
  sensitive   = true
}

output "s3_website_url" {
  description = "S3 static website URL"
  value       = aws_s3_bucket_website_configuration.frontend.website_endpoint
}
