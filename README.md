# Lambda function to fetch Formal Sidecar Credentials on behalf of a user

## Deploy

To deploy the lambda function, run the following commands:

```bash
npm run install
npm run build
terraform init
terraform apply
```

## Usage
You will find an example of client interaction with the lambda function in the `client` directory.
To run the example client, run the following commands:

```bash
cd client
ts-node client.ts
``` 