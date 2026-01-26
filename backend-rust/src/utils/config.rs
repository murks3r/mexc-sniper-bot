use serde::Deserialize;

/// Hauptkonfiguration für Rust Backend
#[derive(Debug, Clone, Deserialize)]
pub struct Config {
    pub mexc_api_key: String,
    pub mexc_secret_key: String,
    pub mexc_base_url: String,
    pub aws_region: String,
    pub dynamodb_table: String,
    pub rust_api_port: u16,
    /// JWT Secret - optional da momentan nicht verwendet
    pub jwt_secret: Option<String>,
}

impl Config {
    /// Lade Config aus Environment Variablen
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();

        Self {
            mexc_api_key: std::env::var("MEXC_API_KEY")
                .expect("MEXC_API_KEY nicht gesetzt"),
            mexc_secret_key: std::env::var("MEXC_SECRET_KEY")
                .expect("MEXC_SECRET_KEY nicht gesetzt"),
            mexc_base_url: std::env::var("MEXC_BASE_URL")
                .unwrap_or_else(|_| "https://api.mexc.com".to_string()),
            aws_region: std::env::var("AWS_REGION")
                .unwrap_or_else(|_| "ap-southeast-1".to_string()),
            dynamodb_table: std::env::var("DYNAMODB_TABLE")
                .unwrap_or_else(|_| "mexc_trading_data".to_string()),
            rust_api_port: std::env::var("RUST_API_PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .expect("RUST_API_PORT muss eine Zahl sein"),
            jwt_secret: std::env::var("JWT_SECRET").ok(),
        }
    }
}
