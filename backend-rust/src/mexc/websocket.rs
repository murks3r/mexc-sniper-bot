use serde::{Deserialize, Serialize};

/// WebSocket Event Types für Real-Time Market Data
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TradeEvent {
    pub symbol: String,
    pub price: f64,
    pub quantity: f64,
    pub timestamp: i64,
    pub is_buyer_maker: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KlineEvent {
    pub symbol: String,
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OrderBookUpdate {
    pub symbol: String,
    pub bids: Vec<(f64, f64)>, // [price, quantity]
    pub asks: Vec<(f64, f64)>, // [price, quantity]
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum WebSocketMessage {
    Trade(TradeEvent),
    Kline(KlineEvent),
    OrderBook(OrderBookUpdate),
}
