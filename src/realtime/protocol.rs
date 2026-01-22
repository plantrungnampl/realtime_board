use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::models::boards::{BoardPermissions, BoardRole};

pub const OP_SYNCSTEP_1: u8 = 0;
pub const OP_SYNCSTEP_2: u8 = 1;
pub const OP_UPDATE: u8 = 2;
pub const OP_AWARENESS: u8 = 3;
pub const OP_ROLE_UPDATE: u8 = 4;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardRoleUpdate {
    pub user_id: Uuid,
    pub role: Option<BoardRole>,
    pub permissions: Option<BoardPermissions>,
}
