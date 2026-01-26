use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use serde_json::json;
use std::sync::Arc;

use crate::mexc::MexcClient;

pub struct MarketState {
    pub mexc_client: Arc<MexcClient>,
}

/// GET /api/market/ticker/:symbol - Get Current Price
pub async fn get_ticker(
    State(state): State<Arc<MarketState>>,
    Path(symbol): Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    match state.mexc_client.get_ticker(&symbol).await {
        Ok(ticker) => Ok(Json(json!({
            "symbol": ticker.symbol,
            "price": ticker.price,
            "timestamp": ticker.timestamp,
        }))),
        Err(e) => {
            tracing::error!("Failed to get ticker: {}", e);
            Err((StatusCode::BAD_GATEWAY, e.to_string()))
        }
    }
}

/// GET /api/market/balance - Get Account Balance
pub async fn get_balance(
    State(state): State<Arc<MarketState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    match state.mexc_client.get_account_balance().await {
        Ok(balance) => {
            let balances: Vec<_> = balance
                .balances
                .iter()
                .map(|b| {
                    json!({
                        "asset": b.asset,
                        "free": b.free,
                        "locked": b.locked,
                    })
                })
                .collect();

            Ok(Json(json!({ "balances": balances })))
        }
        Err(e) => {
            tracing::error!("Failed to get balance: {}", e);
            Err((StatusCode::BAD_GATEWAY, e.to_string()))
        }
    }
}

/// Router für Market Endpoints
pub fn market_router(state: Arc<MarketState>) -> Router {
    Router::new()
        .route("/ticker/:symbol", get(get_ticker))
        .route("/balance", get(get_balance))
        .with_state(state)
}
