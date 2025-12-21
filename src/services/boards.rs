use sqlx::{PgPool, Pool};
use uuid::Uuid;

use crate::{
    error::AppError,
    models::boards::{Board, BoardElement, BoardResponse, CreateBoardRequest},
};
pub struct BoardService;

impl BoardService {
    pub async fn get_board(pool: &PgPool, user_id: Uuid) -> Result<Vec<BoardResponse>, AppError> {
        let result = sqlx::query_as::<_, BoardResponse>(
            r#"
                SELECT board.board.id, board.board.created_by, board.board.organization_id, board.board.name, board.board.description, board.board.thumbnail_url, board.board.created_at, board.board.updated_at, core.user.username
                FROM board.board
                JOIN core.user ON board.board.created_by = core.user.id
                where board.board.created_by = $1
            "#,
        )
        .bind(user_id)
        .fetch_all(pool)
        .await?;
        // println!("resutl service ==== {:?}", result);
        Ok(result)
    }

    pub async fn create_board(
        pool: &PgPool,
        req: CreateBoardRequest,
        user_id: Uuid,
    ) -> Result<Board, AppError> {
        let board_result = sqlx::query_as(
            r#"
                INSERT INTO board.board (created_by, organization_id, name, description)
                VALUES ($1, $2, $3, $4)
                RETURNING *;
            "#,
        )
        .bind(user_id)
        .bind(req.organization_id)
        .bind(req.name)
        .bind(req.description)
        .fetch_one(pool)
        .await?;
        // println!("board result==: {:?}", board_result);
        Ok(board_result)
    }
    pub async fn get_element(
        pool: &PgPool,
        board_id: Uuid,
    ) -> Result<Vec<BoardElement>, sqlx::Error> {
        let result = sqlx::query_as::<_, BoardElement>(
            r#"
            SELECT * FROM board.element WHERE board_id = $1
            "#,
        )
        .bind(board_id)
        .fetch_all(pool)
        .await?;
        println!("board result==: {:?}", result);
        Ok(result)
    }
}

pub async fn create_element(
    pool: &PgPool,
    req: BoardElement,
    user_id: Uuid,
) -> Result<BoardElement, sqlx::Error> {
    // insert to db
    let result = sqlx::query_as::<_,BoardElement>(
        r#"
        INSERT INTO board.element(id, board_id,created_by,element_type, position_x, position_y, width, height, style,properties)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *;
        "#
    )
    .bind(req.id)
    .bind(req.board_id)
    .bind(user_id)
    .bind(req.element_type)
    .bind(req.position_x)
    .bind(req.position_y)
    .bind(req.width)
    .bind(req.height)
    .bind(req.style)
    .bind(req.properties)
    .fetch_one(pool)
    .await?;
    println!("create elemetn ==== {:?}", result);
    Ok(result)
}
pub async fn update_element_final(
    pool: &PgPool,
    user_id: Uuid,
    rq: BoardElement,
) -> Result<BoardElement, sqlx::Error> {
    let update_final = sqlx::query_as::<_,BoardElement>(
    r#"
    UPDATE board.element SET position_x = $1, position_y = $2, width = $3, height = $4, style = $5, properties = $6,version = version + 1
    WHERE id = $7 AND board_id = $8 AND created_by = $9
    RETURNING *;
    "#
)
    .bind(rq.position_x)
    .bind(rq.position_y)
    .bind(rq.width)
    .bind(rq.height)
    .bind(rq.style)
    .bind(rq.properties)
    .bind(rq.id)
    .bind(rq.board_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    println!("update_element_final elemetn ==== {:?}", update_final);

    Ok(update_final)
}
