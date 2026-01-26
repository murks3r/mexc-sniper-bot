use crate::utils::config::Config;
use anyhow::{anyhow, Result};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;

/// MEXC API Request Models
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OrderRequest {
    pub symbol: String,
    pub side: String,
    pub order_type: String,
    pub quantity: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrderResponse {
    pub order_id: String,
    pub symbol: String,
    pub side: String,
    pub order_type: String,
    pub quantity: f64,
    pub price: f64,
    pub status: String,
    pub filled_qty: f64,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TickerResponse {
    pub symbol: String,
    pub price: f64,
    pub timestamp: i64,
}

/// MEXC API Client mit HMAC-SHA256 Signing
pub struct MexcClient {
    base_url: String,
    api_key: String,
    secret_key: String,
    client: reqwest::Client,
}

impl MexcClient {
    /// Erstelle neuen MEXC Client
    pub fn new(config: &Config) -> Result<Self> {
        let client = reqwest::Client::builder()
            .pool_max_idle_per_host(10)
            .connection_verbose(false)
            .build()?;

        Ok(Self {
            base_url: config.mexc_base_url.clone(),
            api_key: config.mexc_api_key.clone(),
            secret_key: config.mexc_secret_key.clone(),
            client,
        })
    }

    /// Erstelle signierte Request mit HMAC-SHA256
    fn create_signature(&self, query_string: &str) -> String {
        let mut mac = HmacSha256::new_from_slice(self.secret_key.as_bytes())
            .expect("HMAC can take key of any size");
        mac.update(query_string.as_bytes());
        hex::encode(mac.finalize().into_bytes())
    }

    /// Rufe Ticker Daten ab (Real-Time Price)
    pub async fn get_ticker(&self, symbol: &str) -> Result<TickerResponse> {
        let url = format!("{}/api/v3/ticker/24hr", self.base_url);
        let mut params = BTreeMap::new();
        params.insert("symbol", symbol.to_string());

        let query_string = Self::build_query_string(&params);

        let response = self
            .client
            .get(&url)
            .query(&params)
            .header("X-MEXC-APIKEY", &self.api_key)
            .send()
            .await?;

        let ticker: TickerResponse = response.json().await?;
        Ok(ticker)
    }

    /// Erstelle neue Order mit Signing
    pub async fn create_order(&self, order: &OrderRequest) -> Result<OrderResponse> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_millis()
            .to_string();

        let mut params = BTreeMap::new();
        params.insert("symbol".to_string(), order.symbol.clone());
        params.insert("side".to_string(), order.side.clone());
        params.insert("type".to_string(), order.order_type.clone());
        params.insert("quantity".to_string(), order.quantity.to_string());

        if let Some(price) = order.price {
            params.insert("price".to_string(), price.to_string());
        }

        params.insert("timestamp".to_string(), timestamp);

        let query_string = Self::build_query_string(&params);
        let signature = self.create_signature(&query_string);

        let url = format!(
            "{}/api/v3/order?{}&signature={}",
            self.base_url, query_string, signature
        );

        let response = self
            .client
            .post(&url)
            .header("X-MEXC-APIKEY", &self.api_key)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_body = response.text().await?;
            return Err(anyhow!("MEXC API Error: {}", error_body));
        }

        let order_response: OrderResponse = response.json().await?;
        Ok(order_response)
    }

    /// Query Order Status
    pub async fn get_order(&self, symbol: &str, order_id: &str) -> Result<OrderResponse> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_millis()
            .to_string();

        let mut params = BTreeMap::new();
        params.insert("symbol".to_string(), symbol.to_string());
        params.insert("orderId".to_string(), order_id.to_string());
        params.insert("timestamp".to_string(), timestamp);

        let query_string = Self::build_query_string(&params);
        let signature = self.create_signature(&query_string);

        let url = format!(
            "{}/api/v3/order?{}&signature={}",
            self.base_url, query_string, signature
        );

        let response = self
            .client
            .get(&url)
            .header("X-MEXC-APIKEY", &self.api_key)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!("Failed to query order: {}", response.status()));
        }

        let order: OrderResponse = response.json().await?;
        Ok(order)
    }

    /// Storniere Order
    pub async fn cancel_order(&self, symbol: &str, order_id: &str) -> Result<OrderResponse> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_millis()
            .to_string();

        let mut params = BTreeMap::new();
        params.insert("symbol".to_string(), symbol.to_string());
        params.insert("orderId".to_string(), order_id.to_string());
        params.insert("timestamp".to_string(), timestamp);

        let query_string = Self::build_query_string(&params);
        let signature = self.create_signature(&query_string);

        let url = format!(
            "{}/api/v3/order?{}&signature={}",
            self.base_url, query_string, signature
        );

        let response = self
            .client
            .delete(&url)
            .header("X-MEXC-APIKEY", &self.api_key)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!("Failed to cancel order: {}", response.status()));
        }

        let order: OrderResponse = response.json().await?;
        Ok(order)
    }

    /// Get Account Balance
    pub async fn get_account_balance(&self) -> Result<AccountBalance> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)?
            .as_millis()
            .to_string();

        let params = vec![("timestamp".to_string(), timestamp)];
        let query_string = params
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<_>>()
            .join("&");

        let signature = self.create_signature(&query_string);

        let url = format!(
            "{}/api/v3/account?{}&signature={}",
            self.base_url, query_string, signature
        );

        let response = self
            .client
            .get(&url)
            .header("X-MEXC-APIKEY", &self.api_key)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(anyhow!("Failed to get account balance: {}", response.status()));
        }

        let balance: AccountBalance = response.json().await?;
        Ok(balance)
    }

    /// Hilfsfunktion: Erstelle Query String aus BTreeMap (sortiert für Signing)
    fn build_query_string(params: &BTreeMap<&str, String>) -> String {
        params
            .iter()
            .map(|(k, v)| format!("{}={}", k, v))
            .collect::<Vec<_>>()
            .join("&")
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AccountBalance {
    pub balances: Vec<BalanceInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BalanceInfo {
    pub asset: String,
    pub free: f64,
    pub locked: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_signature_creation() {
        let config = Config {
            mexc_api_key: "test-key".to_string(),
            mexc_secret_key: "test-secret".to_string(),
            mexc_base_url: "https://api.mexc.com".to_string(),
            aws_region: "ap-southeast-1".to_string(),
            dynamodb_table: "mexc_trading_data".to_string(),
            rust_api_port: 8080,
            jwt_secret: "jwt-secret".to_string(),
        };

        let client = MexcClient::new(&config).expect("Failed to create client");
        let query_string = "symbol=ETHUSDT&quantity=1.0&side=BUY&type=LIMIT&price=2000.0";
        let signature = client.create_signature(query_string);

        assert!(!signature.is_empty());
        assert_eq!(signature.len(), 64); // SHA256 hex = 64 chars
    }
}
