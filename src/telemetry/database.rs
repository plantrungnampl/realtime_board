use std::time::Instant;

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

#[macro_export]
macro_rules! log_query {
    ($name:expr, $query:expr) => {
        $crate::telemetry::database::log_query($name, $query, |_| None).await
    };
}

#[macro_export]
macro_rules! log_query_execute {
    ($name:expr, $query:expr) => {
        $crate::telemetry::database::log_query($name, $query, |result| {
            Some(result.rows_affected())
        })
        .await
    };
}

#[macro_export]
macro_rules! log_query_fetch_all {
    ($name:expr, $query:expr) => {
        $crate::telemetry::database::log_query($name, $query, |rows| {
            Some(rows.len() as u64)
        })
        .await
    };
}

#[macro_export]
macro_rules! log_query_fetch_optional {
    ($name:expr, $query:expr) => {
        $crate::telemetry::database::log_query($name, $query, |row| {
            Some(u64::from(row.is_some()))
        })
        .await
    };
}

#[macro_export]
macro_rules! log_query_fetch_one {
    ($name:expr, $query:expr) => {
        $crate::telemetry::database::log_query($name, $query, |_| Some(1)).await
    };
}
