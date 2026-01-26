use crate::storage::models::{CalendarEventItem, OrderItem, PositionItem};
use anyhow::{anyhow, Result};
use aws_sdk_dynamodb::types::AttributeValue;
use aws_sdk_dynamodb::Client;
use serde_json::json;
use std::collections::HashMap;

/// DynamoDB Storage Layer
pub struct DynamoDBStore {
    client: Client,
    table_name: String,
}

impl DynamoDBStore {
    /// Erstelle neue DynamoDB Store Instanz
    pub async fn new(table_name: String) -> Result<Self> {
        let config = aws_config::load_from_env().await;
        let client = Client::new(&config);

        Ok(Self { client, table_name })
    }

    /// Speichere Order in DynamoDB
    pub async fn put_order(&self, order: &OrderItem) -> Result<()> {
        let mut item = HashMap::new();

        item.insert(
            "user_id".to_string(),
            AttributeValue::S(order.partition_key()),
        );
        item.insert(
            "sk".to_string(),
            AttributeValue::S(order.sort_key()),
        );
        item.insert("order_id".to_string(), AttributeValue::S(order.order_id.clone()));
        item.insert("symbol".to_string(), AttributeValue::S(order.symbol.clone()));
        item.insert("side".to_string(), AttributeValue::S(order.side.clone()));
        item.insert(
            "order_type".to_string(),
            AttributeValue::S(order.order_type.clone()),
        );
        item.insert("quantity".to_string(), AttributeValue::N(order.quantity.to_string()));
        if let Some(price) = order.price {
            item.insert("price".to_string(), AttributeValue::N(price.to_string()));
        }
        item.insert(
            "filled_qty".to_string(),
            AttributeValue::N(order.filled_qty.to_string()),
        );
        item.insert("status".to_string(), AttributeValue::S(order.status.clone()));
        item.insert(
            "timestamp".to_string(),
            AttributeValue::N(order.timestamp.to_string()),
        );
        item.insert(
            "created_at".to_string(),
            AttributeValue::S(order.created_at.clone()),
        );
        item.insert(
            "updated_at".to_string(),
            AttributeValue::S(order.updated_at.clone()),
        );

        if let Some(mexc_id) = &order.mexc_order_id {
            item.insert(
                "mexc_order_id".to_string(),
                AttributeValue::S(mexc_id.clone()),
            );
        }
        if let Some(error) = &order.error_message {
            item.insert("error_message".to_string(), AttributeValue::S(error.clone()));
        }

        item.insert("ttl".to_string(), AttributeValue::N(order.ttl.to_string()));
        item.insert("data_type".to_string(), AttributeValue::S("ORDER".to_string()));

        self.client
            .put_item()
            .table_name(&self.table_name)
            .set_item(Some(item))
            .send()
            .await?;

        Ok(())
    }

    /// Rufe Order nach user_id und order_id ab
    pub async fn get_order(&self, user_id: &str, order_id: &str) -> Result<Option<OrderItem>> {
        let response = self
            .client
            .query()
            .table_name(&self.table_name)
            .key_condition_expression("user_id = :uid AND begins_with(sk, :sk)")
            .expression_attribute_values(":uid".to_string(), AttributeValue::S(user_id.to_string()))
            .expression_attribute_values(
                ":sk".to_string(),
                AttributeValue::S(format!("ORDER#{}#", order_id)),
            )
            .send()
            .await?;

        if let Some(items) = response.items {
            if let Some(item) = items.first() {
                return Ok(Some(self.item_to_order(item)?));
            }
        }

        Ok(None)
    }

    /// Query alle Orders für einen User mit Status
    pub async fn query_orders_by_status(
        &self,
        user_id: &str,
        status: &str,
    ) -> Result<Vec<OrderItem>> {
        let response = self
            .client
            .query()
            .table_name(&self.table_name)
            .key_condition_expression("user_id = :uid")
            .filter_expression("begins_with(sk, :sk) AND #status = :status")
            .expression_attribute_values(":uid".to_string(), AttributeValue::S(user_id.to_string()))
            .expression_attribute_values(":sk".to_string(), AttributeValue::S("ORDER#".to_string()))
            .expression_attribute_values(":status".to_string(), AttributeValue::S(status.to_string()))
            .expression_attribute_names("#status".to_string(), "status".to_string())
            .send()
            .await?;

        let mut orders = Vec::new();
        if let Some(items) = response.items {
            for item in items {
                orders.push(self.item_to_order(&item)?);
            }
        }

        Ok(orders)
    }

    /// Speichere Position in DynamoDB
    pub async fn put_position(&self, position: &PositionItem) -> Result<()> {
        let mut item = HashMap::new();

        item.insert(
            "user_id".to_string(),
            AttributeValue::S(position.partition_key()),
        );
        item.insert("sk".to_string(), AttributeValue::S(position.sort_key()));
        item.insert(
            "position_id".to_string(),
            AttributeValue::S(position.position_id.clone()),
        );
        item.insert("symbol".to_string(), AttributeValue::S(position.symbol.clone()));
        item.insert(
            "entry_price".to_string(),
            AttributeValue::N(position.entry_price.to_string()),
        );
        item.insert(
            "current_price".to_string(),
            AttributeValue::N(position.current_price.to_string()),
        );
        item.insert(
            "quantity".to_string(),
            AttributeValue::N(position.quantity.to_string()),
        );
        item.insert("side".to_string(), AttributeValue::S(position.side.clone()));
        item.insert(
            "entry_time".to_string(),
            AttributeValue::N(position.entry_time.to_string()),
        );
        if let Some(pnl) = position.pnl {
            item.insert("pnl".to_string(), AttributeValue::N(pnl.to_string()));
        }
        if let Some(pnl_pct) = position.pnl_percentage {
            item.insert(
                "pnl_percentage".to_string(),
                AttributeValue::N(pnl_pct.to_string()),
            );
        }
        item.insert("status".to_string(), AttributeValue::S(position.status.clone()));
        item.insert(
            "updated_at".to_string(),
            AttributeValue::S(position.updated_at.clone()),
        );
        item.insert("ttl".to_string(), AttributeValue::N(position.ttl.to_string()));
        item.insert(
            "data_type".to_string(),
            AttributeValue::S("POSITION".to_string()),
        );

        self.client
            .put_item()
            .table_name(&self.table_name)
            .set_item(Some(item))
            .send()
            .await?;

        Ok(())
    }

    /// Query alle offenen Positionen für einen User
    pub async fn query_open_positions(&self, user_id: &str) -> Result<Vec<PositionItem>> {
        let response = self
            .client
            .query()
            .table_name(&self.table_name)
            .key_condition_expression("user_id = :uid")
            .filter_expression("begins_with(sk, :sk) AND #status = :status")
            .expression_attribute_values(":uid".to_string(), AttributeValue::S(user_id.to_string()))
            .expression_attribute_values(":sk".to_string(), AttributeValue::S("POSITION#".to_string()))
            .expression_attribute_values(":status".to_string(), AttributeValue::S("open".to_string()))
            .expression_attribute_names("#status".to_string(), "status".to_string())
            .send()
            .await?;

        let mut positions = Vec::new();
        if let Some(items) = response.items {
            for item in items {
                positions.push(self.item_to_position(&item)?);
            }
        }

        Ok(positions)
    }

    /// Speichere Calendar Event
    pub async fn put_calendar_event(&self, event: &CalendarEventItem) -> Result<()> {
        let mut item = HashMap::new();

        item.insert(
            "user_id".to_string(),
            AttributeValue::S(event.partition_key()),
        );
        item.insert("sk".to_string(), AttributeValue::S(event.sort_key()));
        item.insert("event_id".to_string(), AttributeValue::S(event.event_id.clone()));
        item.insert(
            "token_name".to_string(),
            AttributeValue::S(event.token_name.clone()),
        );
        item.insert("symbol".to_string(), AttributeValue::S(event.symbol.clone()));
        item.insert(
            "launch_time".to_string(),
            AttributeValue::N(event.launch_time.to_string()),
        );
        item.insert(
            "detected_pattern".to_string(),
            AttributeValue::S(event.detected_pattern.clone()),
        );
        item.insert(
            "confidence".to_string(),
            AttributeValue::N(event.confidence.to_string()),
        );
        item.insert(
            "created_at".to_string(),
            AttributeValue::S(event.created_at.clone()),
        );
        item.insert("status".to_string(), AttributeValue::S(event.status.clone()));

        if let Some(exec_time) = event.execution_time {
            item.insert(
                "execution_time".to_string(),
                AttributeValue::N(exec_time.to_string()),
            );
        }

        if !event.executed_orders.is_empty() {
            item.insert(
                "executed_orders".to_string(),
                AttributeValue::Ss(event.executed_orders.clone()),
            );
        }

        item.insert("ttl".to_string(), AttributeValue::N(event.ttl.to_string()));
        item.insert(
            "data_type".to_string(),
            AttributeValue::S("CALENDAR".to_string()),
        );

        self.client
            .put_item()
            .table_name(&self.table_name)
            .set_item(Some(item))
            .send()
            .await?;

        Ok(())
    }

    /// Query Calendar Events innerhalb eines Zeitfensters
    pub async fn query_calendar_events_by_time(
        &self,
        user_id: &str,
        start_time: i64,
        end_time: i64,
    ) -> Result<Vec<CalendarEventItem>> {
        let response = self
            .client
            .query()
            .table_name(&self.table_name)
            .key_condition_expression("user_id = :uid")
            .filter_expression("begins_with(sk, :sk) AND #launch >= :start AND #launch <= :end")
            .expression_attribute_values(":uid".to_string(), AttributeValue::S(user_id.to_string()))
            .expression_attribute_values(":sk".to_string(), AttributeValue::S("CALENDAR#".to_string()))
            .expression_attribute_values(":start".to_string(), AttributeValue::N(start_time.to_string()))
            .expression_attribute_values(":end".to_string(), AttributeValue::N(end_time.to_string()))
            .expression_attribute_names("#launch".to_string(), "launch_time".to_string())
            .send()
            .await?;

        let mut events = Vec::new();
        if let Some(items) = response.items {
            for item in items {
                events.push(self.item_to_calendar_event(&item)?);
            }
        }

        Ok(events)
    }

    // Helper: Konvertiere AttributeValue Item zu OrderItem
    fn item_to_order(&self, item: &HashMap<String, AttributeValue>) -> Result<OrderItem> {
        Ok(OrderItem {
            user_id: self.get_string(item, "user_id")?,
            order_id: self.get_string(item, "order_id")?,
            symbol: self.get_string(item, "symbol")?,
            side: self.get_string(item, "side")?,
            order_type: self.get_string(item, "order_type")?,
            quantity: self.get_number(item, "quantity")?,
            price: self.get_optional_number(item, "price"),
            filled_qty: self.get_number(item, "filled_qty")?,
            status: self.get_string(item, "status")?,
            timestamp: self.get_number(item, "timestamp")? as i64,
            created_at: self.get_string(item, "created_at")?,
            updated_at: self.get_string(item, "updated_at")?,
            mexc_order_id: self.get_optional_string(item, "mexc_order_id"),
            error_message: self.get_optional_string(item, "error_message"),
            ttl: self.get_number(item, "ttl")? as i64,
        })
    }

    fn item_to_position(&self, item: &HashMap<String, AttributeValue>) -> Result<PositionItem> {
        Ok(PositionItem {
            user_id: self.get_string(item, "user_id")?,
            position_id: self.get_string(item, "position_id")?,
            symbol: self.get_string(item, "symbol")?,
            entry_price: self.get_number(item, "entry_price")?,
            current_price: self.get_number(item, "current_price")?,
            quantity: self.get_number(item, "quantity")?,
            side: self.get_string(item, "side")?,
            entry_time: self.get_number(item, "entry_time")? as i64,
            pnl: self.get_optional_number(item, "pnl"),
            pnl_percentage: self.get_optional_number(item, "pnl_percentage"),
            status: self.get_string(item, "status")?,
            updated_at: self.get_string(item, "updated_at")?,
            ttl: self.get_number(item, "ttl")? as i64,
        })
    }

    fn item_to_calendar_event(&self, item: &HashMap<String, AttributeValue>) -> Result<CalendarEventItem> {
        Ok(CalendarEventItem {
            user_id: self.get_string(item, "user_id")?,
            event_id: self.get_string(item, "event_id")?,
            token_name: self.get_string(item, "token_name")?,
            symbol: self.get_string(item, "symbol")?,
            launch_time: self.get_number(item, "launch_time")? as i64,
            detected_pattern: self.get_string(item, "detected_pattern")?,
            confidence: self.get_number(item, "confidence")?,
            created_at: self.get_string(item, "created_at")?,
            status: self.get_string(item, "status")?,
            execution_time: self.get_optional_number(item, "execution_time").map(|v| v as i64),
            executed_orders: self.get_optional_string_list(item, "executed_orders").unwrap_or_default(),
            ttl: self.get_number(item, "ttl")? as i64,
        })
    }

    fn get_string(&self, item: &HashMap<String, AttributeValue>, key: &str) -> Result<String> {
        item.get(key)
            .and_then(|v| v.as_s().ok())
            .cloned()
            .ok_or_else(|| anyhow!("Missing or invalid field: {}", key))
    }

    fn get_optional_string(&self, item: &HashMap<String, AttributeValue>, key: &str) -> Option<String> {
        item.get(key).and_then(|v| v.as_s().ok()).cloned()
    }

    fn get_optional_string_list(&self, item: &HashMap<String, AttributeValue>, key: &str) -> Option<Vec<String>> {
        item.get(key).and_then(|v| v.as_ss().ok()).cloned()
    }

    fn get_number(&self, item: &HashMap<String, AttributeValue>, key: &str) -> Result<f64> {
        item.get(key)
            .and_then(|v| v.as_n().ok())
            .and_then(|n| n.parse::<f64>().ok())
            .ok_or_else(|| anyhow!("Missing or invalid number field: {}", key))
    }

    fn get_optional_number(&self, item: &HashMap<String, AttributeValue>, key: &str) -> Option<f64> {
        item.get(key)
            .and_then(|v| v.as_n().ok())
            .and_then(|n| n.parse::<f64>().ok())
    }
}
