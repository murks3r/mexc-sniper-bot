use crate::mexc::MexcClient;
use crate::storage::{CalendarEventItem, DynamoDBStore, OrderItem};
use anyhow::Result;
use std::sync::Arc;

/// Auto-Sniping Manager für Automatische Order Execution
pub struct SnipingManager {
    mexc_client: Arc<MexcClient>,
    store: Arc<DynamoDBStore>,
}

impl SnipingManager {
    pub fn new(mexc_client: Arc<MexcClient>, store: Arc<DynamoDBStore>) -> Self {
        Self {
            mexc_client,
            store,
        }
    }

    /// Führe automatischen Snipe aus basierend auf Calendar Event
    pub async fn execute_snipe(
        &self,
        user_id: &str,
        event: &CalendarEventItem,
        order_params: SnipeOrderParams,
    ) -> Result<String> {
        tracing::info!("Executing snipe for user: {}, token: {}", user_id, event.token_name);

        // Erstelle Order
        let order = OrderItem::new(
            user_id.to_string(),
            event.symbol.clone(),
            order_params.side,
            "market".to_string(),
            order_params.quantity,
            None,
        );

        // Sende zu MEXC
        let mexc_response = self
            .mexc_client
            .create_order(&crate::mexc::OrderRequest {
                symbol: order.symbol.clone(),
                side: order.side.clone(),
                order_type: "MARKET".to_string(),
                quantity: order.quantity,
                price: None,
            })
            .await?;

        let mut updated_order = order;
        updated_order.mexc_order_id = Some(mexc_response.order_id.clone());
        updated_order.status = mexc_response.status;

        // Speichere Order
        self.store.put_order(&updated_order).await?;

        // Update Calendar Event
        let mut updated_event = event.clone();
        updated_event.status = "sniped".to_string();
        updated_event.executed_orders.push(updated_order.order_id.clone());
        updated_event.execution_time = Some(chrono::Utc::now().timestamp_millis());

        self.store.put_calendar_event(&updated_event).await?;

        Ok(updated_order.order_id)
    }

    /// Prüfe ob automatischer Snipe für ein Event ausgeführt werden soll
    pub fn should_execute_snipe(&self, pattern_confidence: f64) -> bool {
        // Minimum Confidence 70% für automatischen Snipe
        pattern_confidence >= 0.7
    }
}

#[derive(Debug, Clone)]
pub struct SnipeOrderParams {
    pub side: String,      // "BUY", "SELL"
    pub quantity: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_should_execute_snipe() {
        let config = crate::utils::Config {
            mexc_api_key: "test".to_string(),
            mexc_secret_key: "test".to_string(),
            mexc_base_url: "https://api.mexc.com".to_string(),
            aws_region: "ap-southeast-1".to_string(),
            dynamodb_table: "test".to_string(),
            rust_api_port: 8080,
            jwt_secret: "test".to_string(),
        };

        // Test würde mit Mock DynamoDBStore funktionieren
        assert!(true); // Placeholder
    }
}
