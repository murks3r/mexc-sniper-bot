#!/bin/bash

# DynamoDB Table Creation & Setup Script
# Erstelle DynamoDB Tabelle mit optimalem Schema für MEXC Trading Data

set -e

# Configuration
TABLE_NAME="${DYNAMODB_TABLE:-mexc_trading_data}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
BILLING_MODE="${BILLING_MODE:-PAY_PER_REQUEST}"  # On-demand billing

echo "🚀 Creating DynamoDB Table: $TABLE_NAME in region $AWS_REGION"

# Main Table
echo "📋 Creating main table..."
aws dynamodb create-table \
  --table-name "$TABLE_NAME" \
  --attribute-definitions \
    AttributeName=user_id,AttributeType=S \
    AttributeName=sk,AttributeType=S \
    AttributeName=symbol,AttributeType=S \
    AttributeName=data_type,AttributeType=S \
  --key-schema \
    AttributeName=user_id,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  --billing-mode "$BILLING_MODE" \
  --global-secondary-indexes \
    '[
      {
        "IndexName": "symbol-index",
        "KeySchema": [
          {"AttributeName": "symbol", "KeyType": "HASH"},
          {"AttributeName": "sk", "KeyType": "RANGE"}
        ],
        "Projection": {"ProjectionType": "ALL"},
        "BillingMode": "'$BILLING_MODE'"
      },
      {
        "IndexName": "data_type-index",
        "KeySchema": [
          {"AttributeName": "data_type", "KeyType": "HASH"},
          {"AttributeName": "sk", "KeyType": "RANGE"}
        ],
        "Projection": {"ProjectionType": "ALL"},
        "BillingMode": "'$BILLING_MODE'"
      }
    ]' \
  --tags Key=Environment,Value=production Key=Application,Value=mexc-sniper-bot \
  --region "$AWS_REGION"

echo "✓ Table created successfully"

# Enable TTL
echo "⏰ Enabling TTL for automatic cleanup..."
aws dynamodb update-time-to-live \
  --table-name "$TABLE_NAME" \
  --time-to-live-specification "AttributeName=ttl,Enabled=true" \
  --region "$AWS_REGION"

echo "✓ TTL enabled"

# Enable Point-in-Time Recovery
echo "🔄 Enabling Point-in-Time Recovery..."
aws dynamodb update-continuous-backups \
  --table-name "$TABLE_NAME" \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true \
  --region "$AWS_REGION"

echo "✓ Point-in-Time Recovery enabled"

# Enable Streams
echo "📡 Enabling DynamoDB Streams..."
aws dynamodb update-table \
  --table-name "$TABLE_NAME" \
  --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES \
  --region "$AWS_REGION"

echo "✓ Streams enabled"

echo "✅ DynamoDB Setup Complete!"
echo ""
echo "Table Details:"
echo "  Table Name: $TABLE_NAME"
echo "  Region: $AWS_REGION"
echo "  Billing Mode: $BILLING_MODE"
echo "  Primary Key: user_id (HASH) + sk (RANGE)"
echo "  GSI: symbol-index, data_type-index"
echo "  TTL: Enabled (expiry_time)"
echo "  Point-in-Time Recovery: Enabled"
echo "  Streams: Enabled (NEW_AND_OLD_IMAGES)"
