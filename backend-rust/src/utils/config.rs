use aws_config::BehaviorVersion;
use aws_sdk_ssm::Client as SsmClient;
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
    pub jwt_secret: Option<String>,
    pub clerk_secret_key: Option<String>,
    pub supabase_url: Option<String>,
    pub supabase_service_role_key: Option<String>,
    pub openai_api_key: Option<String>,
}

impl Config {
    /// Lade Config aus Environment Variablen (Fallback wenn SSM deaktiviert)
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
            clerk_secret_key: std::env::var("CLERK_SECRET_KEY").ok(),
            supabase_url: std::env::var("SUPABASE_URL").ok(),
            supabase_service_role_key: std::env::var("SUPABASE_SERVICE_ROLE_KEY").ok(),
            openai_api_key: std::env::var("OPENAI_API_KEY").ok(),
        }
    }

    /// Lade Secrets aus AWS SSM Parameter Store, Rest aus Env.
    /// SSM-Pfade nutzen den Prefix aus SSM_PREFIX (default: /app/mexc-sniper-bot).
    ///
    /// SSM Parameter (SecureString):
    ///   {prefix}/mexc/api-key
    ///   {prefix}/mexc/secret-key
    ///   {prefix}/clerk/secret-key
    ///   {prefix}/supabase/url
    ///   {prefix}/supabase/service-role-key
    ///   {prefix}/openai/api-key
    ///   {prefix}/jwt-secret (optional)
    pub async fn from_ssm() -> Self {
        dotenvy::dotenv().ok();

        let shared_config = aws_config::load_defaults(BehaviorVersion::latest()).await;
        let ssm = SsmClient::new(&shared_config);

        let prefix = std::env::var("SSM_PREFIX")
            .unwrap_or_else(|_| "/app/mexc-sniper-bot".to_string());

        let mexc_api_key = fetch_ssm_param(&ssm, &format!("{}/mexc/api-key", prefix)).await;
        let mexc_secret_key = fetch_ssm_param(&ssm, &format!("{}/mexc/secret-key", prefix)).await;
        let clerk_secret_key = fetch_ssm_param_opt(&ssm, &format!("{}/clerk/secret-key", prefix)).await;
        let supabase_url = fetch_ssm_param_opt(&ssm, &format!("{}/supabase/url", prefix)).await;
        let supabase_service_role_key = fetch_ssm_param_opt(&ssm, &format!("{}/supabase/service-role-key", prefix)).await;
        let openai_api_key = fetch_ssm_param_opt(&ssm, &format!("{}/openai/api-key", prefix)).await;
        let jwt_secret = fetch_ssm_param_opt(&ssm, &format!("{}/jwt-secret", prefix)).await;

        Self {
            mexc_api_key,
            mexc_secret_key,
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
            jwt_secret,
            clerk_secret_key,
            supabase_url,
            supabase_service_role_key,
            openai_api_key,
        }
    }

    /// Wähle automatisch: SSM wenn USE_SSM=true, sonst Env.
    pub async fn load() -> Self {
        let use_ssm = std::env::var("USE_SSM")
            .map(|v| v == "true" || v == "1")
            .unwrap_or(false);

        if use_ssm {
            tracing::info!("Config: Lade Secrets aus AWS SSM Parameter Store");
            Self::from_ssm().await
        } else {
            tracing::info!("Config: Lade aus Environment Variablen");
            Self::from_env()
        }
    }
}

/// SSM Parameter laden (required – panicked wenn er fehlt)
async fn fetch_ssm_param(client: &SsmClient, name: &str) -> String {
    let resp = client
        .get_parameter()
        .name(name)
        .with_decryption(true)
        .send()
        .await
        .unwrap_or_else(|e| panic!("SSM Parameter '{}' nicht lesbar: {}", name, e));

    resp.parameter()
        .and_then(|p| p.value())
        .unwrap_or_else(|| panic!("SSM Parameter '{}' hat keinen Wert", name))
        .to_string()
}

/// SSM Parameter laden (optional – gibt None zurück wenn er fehlt)
async fn fetch_ssm_param_opt(client: &SsmClient, name: &str) -> Option<String> {
    client
        .get_parameter()
        .name(name)
        .with_decryption(true)
        .send()
        .await
        .ok()
        .and_then(|r| r.parameter().and_then(|p| p.value().map(|v| v.to_string())))
}
