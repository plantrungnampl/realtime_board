#[tokio::main]
async fn main() {
    if let Err(err) = app::run().await {
        tracing::error!("Application failed to start: {}", err);
        std::process::exit(1);
    }
}

mod api;
mod app;
mod auth;
mod dto;
mod error;
mod models;
mod realtime;
mod repositories;
mod services;
mod telemetry;
mod usecases;
