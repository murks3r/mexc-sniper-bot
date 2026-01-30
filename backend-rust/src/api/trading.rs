use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get, post},
    Json, Router,
};
use serde_json::json;
use std::sync::Arc;

use crate::mexc::MexcClient;
use crate::storage::{DynamoDBStore, OrderItem};

pub struct TradingState {
    pub mexc_client: Arc<MexcClient>,
    pub store: Arc<DynamoDBStore>,
}

/// POST /api/trade/order - Erstelle neue Order
pub async fn create_order(
    State(state): State<Arc<TradingState>>,
    Path(user_id): Path<String>,
    Json(payload): Json<OrderRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, String)> {
    tracing::info!("Creating order for user: {}", user_id);

    // Validierung
    if payload.quantity <= 0.0 {
        return Err((StatusCode::BAD_REQUEST, "Quantity must be positive".to_string()));
    }

    // Erstelle Order Item
    let mut order = OrderItem::new(
        user_id.clone(),
        payload.symbol.clone(),
        payload.side.clone(),
        payload.order_type.clone(),
        payload.quantity,
        payload.price,
    );

    // Konvertiere zu MEXC OrderRequest
    let mexc_order = crate::mexc::models::OrderRequest {
        symbol: payload.symbol.clone(),
        side: payload.side.clone(),
        order_type: payload.order_type.clone(),
        quantity: payload.quantity,
        price: payload.price,
    };

    // Sende zu MEXC
    match state.mexc_client.create_order(&mexc_order).await {
        Ok(mexc_response) => {
            order.mexc_order_id = Some(mexc_response.order_id.clone());
            order.status = mexc_response.status.clone();

            // Speichere in DynamoDB
            if let Err(e) = state.store.put_order(&order).await {
                tracing::error!("Failed to store order: {}", e);
                return Err((StatusCode::INTERNAL_SERVER_ERROR, format!("Storage error: {}", e)));
            }

            Ok((
                StatusCode::CREATED,
                Json(json!({
                    "order_id": order.order_id,
                    "status": order.status,
                    "mexc_order_id": order.mexc_order_id,
                })),
            ))
        }
        Err(e) => {
            tracing::error!("MEXC API error: {}", e);
            order.error_message = Some(e.to_string());
            order.status = "error".to_string();
            let _ = state.store.put_order(&order).await;

            Err((StatusCode::BAD_GATEWAY, e.to_string()))
        }
    }
}

/// GET /api/trade/order/:order_id - Get Order Status
pub async fn get_order(
    State(state): State<Arc<TradingState>>,
    Path((user_id, order_id)): Path<(String, String)>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    match state.store.get_order(&user_id, &order_id).await {
        Ok(Some(order)) => {
            Ok(Json(json!({
                "order_id": order.order_id,
                "symbol": order.symbol,
                "side": order.side,
                "quantity": order.quantity,
                "filled_qty": order.filled_qty,
                "status": order.status,
                "price": order.price,
                "created_at": order.created_at,
            })))
        }
        Ok(None) => Err((StatusCode::NOT_FOUND, "Order not found".to_string())),
        Err(e) => {
            tracing::error!("Database error: {}", e);
            Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
        }
    }
}

/// DELETE /api/trade/order/:order_id - Cancel Order
pub async fn cancel_order(
    State(state): State<Arc<TradingState>>,
    Path((user_id, order_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<serde_json::Value>), (StatusCode, String)> {
    // Hole Order Informationen
    let order = state
        .store
        .get_order(&user_id, &order_id)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((StatusCode::NOT_FOUND, "Order not found".to_string()))?;

    if let Some(mexc_order_id) = &order.mexc_order_id {
        // Storniere bei MEXC
        match state
            .mexc_client
            .cancel_order(&order.symbol, mexc_order_id)
            .await
        {
            Ok(_) => {
                tracing::info!("Order cancelled successfully: {}", order_id);
                Ok((StatusCode::OK, Json(json!({"status": "cancelled"}))))
            }
            Err(e) => {
                tracing::error!("Failed to cancel order: {}", e);
                Err((StatusCode::BAD_GATEWAY, e.to_string()))
            }
        }
    } else {
        Err((StatusCode::BAD_REQUEST, "Order not yet sent to MEXC".to_string()))
    }
}

#[derive(serde::Deserialize)]
pub struct OrderRequest {
    pub symbol: String,
    pub side: String,
    pub order_type: String,
    pub quantity: f64,
    #[serde(default)]
    pub price: Option<f64>,
}

/// Router für Trading Endpoints
pub fn trading_router(state: Arc<TradingState>) -> Router {
    Router::new()
        .route("/order", post(create_order))
        .route("/order/:user_id/:order_id", get(get_order))
        .route("/order/:user_id/:order_id", delete(cancel_order))
        .with_state(state)
}
