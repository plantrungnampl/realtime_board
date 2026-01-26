use std::time::Instant;

use sqlx::postgres::PgQueryResult;
use tracing::{Instrument, debug, info_span, warn};

pub async fn log_query<F, T, E, R>(
    query_name: &str,
    query: F,
    row_counter: R,
) -> Result<T, E>
where
    F: std::future::Future<Output = Result<T, E>>,
    E: std::fmt::Debug,
    R: Fn(&T) -> Option<u64>,
{
    let span = info_span!("db_query", query = %query_name);
    let start = Instant::now();
    let result = query.instrument(span.clone()).await;
    let duration_ms = start.elapsed().as_millis();

    span.in_scope(|| match &result {
        Ok(value) => {
            if let Some(rows) = row_counter(value) {
                debug!(latency_ms = %duration_ms, rows = %rows, "Query executed successfully");
            } else {
                debug!(latency_ms = %duration_ms, "Query executed successfully");
            }
        }
        Err(error) => {
            warn!(latency_ms = %duration_ms, error = ?error, "Query failed");
        }
    });

    result
}

pub async fn log_query_execute<F, E>(
    query_name: &str,
    query: F,
) -> Result<PgQueryResult, E>
where
    F: std::future::Future<Output = Result<PgQueryResult, E>>,
    E: std::fmt::Debug,
{
    log_query(query_name, query, |result| Some(result.rows_affected())).await
}

pub async fn log_query_fetch_all<F, T, E>(
    query_name: &str,
    query: F,
) -> Result<Vec<T>, E>
where
    F: std::future::Future<Output = Result<Vec<T>, E>>,
    E: std::fmt::Debug,
{
    log_query(query_name, query, |rows| Some(rows.len() as u64)).await
}

pub async fn log_query_fetch_optional<F, T, E>(
    query_name: &str,
    query: F,
) -> Result<Option<T>, E>
where
    F: std::future::Future<Output = Result<Option<T>, E>>,
    E: std::fmt::Debug,
{
    log_query(query_name, query, |row| Some(u64::from(row.is_some()))).await
}

pub async fn log_query_fetch_one<F, T, E>(
    query_name: &str,
    query: F,
) -> Result<T, E>
where
    F: std::future::Future<Output = Result<T, E>>,
    E: std::fmt::Debug,
{
    log_query(query_name, query, |_| Some(1)).await
}

#[macro_export]
macro_rules! log_query {
    ($name:expr, $query:expr) => {
        $crate::telemetry::database::log_query($name, $query, |_| None).await
    };
}

#[macro_export]
macro_rules! log_query_execute {
    ($name:expr, $query:expr) => {
        $crate::telemetry::database::log_query_execute($name, $query).await
    };
}

#[macro_export]
macro_rules! log_query_fetch_all {
    ($name:expr, $query:expr) => {
        $crate::telemetry::database::log_query_fetch_all($name, $query).await
    };
}

#[macro_export]
macro_rules! log_query_fetch_optional {
    ($name:expr, $query:expr) => {
        $crate::telemetry::database::log_query_fetch_optional($name, $query).await
    };
}

#[macro_export]
macro_rules! log_query_fetch_one {
    ($name:expr, $query:expr) => {
        $crate::telemetry::database::log_query_fetch_one($name, $query).await
    };
}
