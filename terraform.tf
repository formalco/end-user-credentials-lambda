provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type = string
}

variable "formal_api_key" {
    type      = string
    sensitive = true
}

variable "api_stage_auto_deploy" {
  type = bool
}

resource "aws_iam_role" "lambda_execution_role" {
  name = "lambda_execution_role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action = "sts:AssumeRole",
      Effect = "Allow",
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_policy_attachment" "lambda_execution" {
    name = "formal-credentials-lambda_execution"
    roles = [aws_iam_role.lambda_execution_role.name]
    policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "lambda_secret_policy" {
  name = "lambda"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action = [
        "secretsmanager:GetSecretValue",
      ],
      Effect = "Allow",
      Resource = aws_secretsmanager_secret.api_key.arn
    }]
  })
}

resource "aws_iam_policy_attachment" "lambda_secret" {
  name = "formal-credentials-lambda-secret-policy"
  roles = [aws_iam_role.lambda_execution_role.name]
  policy_arn = aws_iam_policy.lambda_secret_policy.arn
}

resource "aws_lambda_function" "credentials-lambda" {
  filename      = "dist/index.zip"
  function_name = "formal-credentials"
  role          = aws_iam_role.lambda_execution_role.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
}

resource "aws_cloudwatch_log_group" "lambda_logs" {
  name = "/aws/lambda/${aws_lambda_function.credentials-lambda.function_name}"
}

resource "aws_secretsmanager_secret" "api_key" {
  name = "formal-api-key"
}

resource "aws_secretsmanager_secret_version" "api_key" {
  secret_id     = aws_secretsmanager_secret.api_key.id
  secret_string = var.formal_api_key
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowExecutionFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.credentials-lambda.function_name
  principal     = "apigateway.amazonaws.com"
}

resource "aws_apigatewayv2_api" "formal" {
  name          = "formal-credentials"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_authorizer" "iam_authorizer" {
  api_id  = aws_apigatewayv2_api.formal.id
  name    = "iam-authorizer"
  authorizer_type = "REQUEST"
  authorizer_uri = aws_lambda_function.credentials-lambda.invoke_arn
  authorizer_payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "get_credentials_route" {
  api_id    = aws_apigatewayv2_api.formal.id
  route_key = "GET /crendentials"
  target    = "integrations/${aws_apigatewayv2_integration.integration.id}"
  authorization_type = "AWS_IAM"
}

resource "aws_apigatewayv2_integration" "integration" {
  api_id            = aws_apigatewayv2_api.formal.id
  integration_type  = "AWS_PROXY"
  integration_uri   = aws_lambda_function.credentials-lambda.invoke_arn
}

resource "aws_apigatewayv2_deployment" "deployment" {
  api_id = aws_apigatewayv2_api.formal.id
   
  triggers = {
    redeployment = sha1(join(",", tolist([
      jsonencode(aws_apigatewayv2_integration.integration),
      jsonencode(aws_apigatewayv2_route.get_credentials_route),
    ])))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_apigatewayv2_stage" "stage" {
  api_id      = aws_apigatewayv2_api.formal.id
  name        = "prod"
  deployment_id = aws_apigatewayv2_deployment.deployment.id
  auto_deploy = var.api_stage_auto_deploy
}

output "api_endpoint" {
  value = aws_apigatewayv2_stage.stage.invoke_url
}
