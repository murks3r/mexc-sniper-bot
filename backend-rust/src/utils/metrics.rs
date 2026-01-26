use prometheus::{
    Counter, CounterVec, Histogram, HistogramVec, IntGauge, Registry,
};
use std::sync::Arc;

/// Prometheus Metrics für Order Latency, Error Rates, etc.
pub struct Metrics {
    pub registry: Registry,
    pub order_latency: HistogramVec,
    pub api_request_count: CounterVec,
    pub api_error_count: CounterVec,
    pub mexc_api_errors: Counter,
    pub active_orders: IntGauge,
    pub active_positions: IntGauge,
}

impl Metrics {
    pub fn new() -> Self {
        let registry = Registry::new();

        let order_latency = HistogramVec::new(
            prometheus::HistogramOpts::new(
                "order_latency_seconds",
                "Order execution latency in seconds",
            ),
            &["endpoint"],
        )
        .expect("Failed to create order_latency metric");

        let api_request_count = CounterVec::new(
            prometheus::CounterOpts::new("api_requests_total", "Total API requests"),
            &["endpoint", "status"],
        )
        .expect("Failed to create api_request_count metric");

        let api_error_count = CounterVec::new(
            prometheus::CounterOpts::new("api_errors_total", "Total API errors"),
            &["endpoint", "error_type"],
        )
        .expect("Failed to create api_error_count metric");

        let mexc_api_errors = Counter::new("mexc_api_errors", "MEXC API errors")
            .expect("Failed to create mexc_api_errors metric");

        let active_orders = IntGauge::new("active_orders", "Currently active orders")
            .expect("Failed to create active_orders metric");

        let active_positions = IntGauge::new("active_positions", "Currently active positions")
            .expect("Failed to create active_positions metric");

        registry.register(Box::new(order_latency.clone())).ok();
        registry.register(Box::new(api_request_count.clone())).ok();
        registry.register(Box::new(api_error_count.clone())).ok();
        registry.register(Box::new(mexc_api_errors.clone())).ok();
        registry.register(Box::new(active_orders.clone())).ok();
        registry.register(Box::new(active_positions.clone())).ok();

        Self {
            registry,
            order_latency,
            api_request_count,
            api_error_count,
            mexc_api_errors,
            active_orders,
            active_positions,
        }
    }

    pub fn registry(&self) -> &Registry {
        &self.registry
    }
}

impl Default for Metrics {
    fn default() -> Self {
        Self::new()
    }
}
