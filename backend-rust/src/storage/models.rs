use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Typ für Order-Status
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OrderStatus {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "open")]
    Open,
    #[serde(rename = "filled")]
    Filled,
    #[serde(rename = "cancelled")]
    Cancelled,
    #[serde(rename = "error")]
    Error,
}

impl OrderStatus {
    pub fn as_str(&self) -> &str {
        match self {
            OrderStatus::Pending => "pending",
            OrderStatus::Open => "open",
            OrderStatus::Filled => "filled",
            OrderStatus::Cancelled => "cancelled",
            OrderStatus::Error => "error",
        }
    }
}

/// DynamoDB Order Item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderItem {
    pub user_id: String,
    pub order_id: String,
    pub symbol: String,
    pub side: String, // "buy" oder "sell"
    pub order_type: String, // "limit", "market"
    pub quantity: f64,
    pub price: Option<f64>,
    pub filled_qty: f64,
    pub status: String,
    pub timestamp: i64, // Unix timestamp in Millisekunden
    pub created_at: String, // ISO 8601
    pub updated_at: String, // ISO 8601
    pub mexc_order_id: Option<String>,
    pub error_message: Option<String>,
    pub ttl: i64, // TTL für DynamoDB (90 Tage)
}

impl OrderItem {
    pub fn new(
        user_id: String,
        symbol: String,
        side: String,
        order_type: String,
        quantity: f64,
        price: Option<f64>,
    ) -> Self {
        let now = Utc::now();
        let timestamp = now.timestamp_millis();
        let ttl = (now.timestamp() + 7776000) as i64; // +90 Tage

        Self {
            user_id,
            order_id: Uuid::new_v4().to_string(),
            symbol,
            side,
            order_type,
            quantity,
            price,
            filled_qty: 0.0,
            status: OrderStatus::Pending.as_str().to_string(),
            timestamp,
            created_at: now.to_rfc3339(),
            updated_at: now.to_rfc3339(),
            mexc_order_id: None,
            error_message: None,
            ttl,
        }
    }

    pub fn partition_key(&self) -> String {
        self.user_id.clone()
    }

    pub fn sort_key(&self) -> String {
        format!("ORDER#{}#{}", self.timestamp, self.order_id)
    }
}

/// DynamoDB Position Item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionItem {
    pub user_id: String,
    pub position_id: String,
    pub symbol: String,
    pub entry_price: f64,
    pub current_price: f64,
    pub quantity: f64,
    pub side: String, // "long" oder "short"
    pub entry_time: i64,
    pub pnl: Option<f64>,
    pub pnl_percentage: Option<f64>,
    pub status: String, // "open", "closed", "liquidated"
    pub updated_at: String,
    pub ttl: i64,
}

impl PositionItem {
    pub fn new(
        user_id: String,
        symbol: String,
        entry_price: f64,
        quantity: f64,
        side: String,
    ) -> Self {
        let now = Utc::now();
        let timestamp = now.timestamp_millis();
        let ttl = (now.timestamp() + 7776000) as i64;

        Self {
            user_id,
            position_id: Uuid::new_v4().to_string(),
            symbol,
            entry_price,
            current_price: entry_price,
            quantity,
            side,
            entry_time: timestamp,
            pnl: None,
            pnl_percentage: None,
            status: "open".to_string(),
            updated_at: now.to_rfc3339(),
            ttl,
        }
    }

    pub fn partition_key(&self) -> String {
        self.user_id.clone()
    }

    pub fn sort_key(&self) -> String {
        format!("POSITION#{}#{}", self.entry_time, self.position_id)
    }

    pub fn calculate_pnl(&mut self, current_price: f64) {
        self.current_price = current_price;
        let price_diff = match self.side.as_str() {
            "long" => current_price - self.entry_price,
            "short" => self.entry_price - current_price,
            _ => 0.0,
        };
        self.pnl = Some(price_diff * self.quantity);
        self.pnl_percentage = Some((price_diff / self.entry_price) * 100.0);
        self.updated_at = Utc::now().to_rfc3339();
    }
}

/// DynamoDB Calendar/Launch Event Item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalendarEventItem {
    pub user_id: String,
    pub event_id: String,
    pub token_name: String,
    pub symbol: String,
    pub launch_time: i64, // Unix timestamp
    pub detected_pattern: String, // "sts:2", "st:2", "tt:4", etc.
    pub confidence: f64,
    pub created_at: String,
    pub status: String, // "detected", "sniped", "missed"
    pub execution_time: Option<i64>,
    pub executed_orders: Vec<String>, // Order IDs
    pub ttl: i64,
}

impl CalendarEventItem {
    pub fn new(
        user_id: String,
        token_name: String,
        symbol: String,
        launch_time: i64,
        detected_pattern: String,
        confidence: f64,
    ) -> Self {
        let now = Utc::now();
        let ttl = (now.timestamp() + 7776000) as i64;

        Self {
            user_id,
            event_id: Uuid::new_v4().to_string(),
            token_name,
            symbol,
            launch_time,
            detected_pattern,
            confidence,
            created_at: now.to_rfc3339(),
            status: "detected".to_string(),
            execution_time: None,
            executed_orders: Vec::new(),
            ttl,
        }
    }

    pub fn partition_key(&self) -> String {
        self.user_id.clone()
    }

    pub fn sort_key(&self) -> String {
        format!("CALENDAR#{}#{}", self.launch_time, self.event_id)
    }
}

/// GSI für Symbol-Queries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SymbolIndex {
    pub symbol: String,
    pub timestamp: i64,
}

/// GSI für Status-Queries
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusIndex {
    pub status: String,
    pub timestamp: i64,
}

/// Generisches DynamoDB Item Wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum DynamoItem {
    Order(OrderItem),
    Position(PositionItem),
    CalendarEvent(CalendarEventItem),
}
