#[tokio::main]
async fn main() {
    app::run().await;
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
mod usecases;
