-- server/src/db/schema_files.sql
-- 文件上传与对象存储模块 (4张新表)

CREATE TABLE IF NOT EXISTS storage_configs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(32) NOT NULL COMMENT '存储提供商: local/tencent_cos/aliyun_oss/qiniu_kodo/upyun_uss/chinamobile_eos',
  provider_name VARCHAR(64) NOT NULL DEFAULT '' COMMENT '配置名称',
  is_default TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否默认存储',
  config JSON NOT NULL DEFAULT ('{}') COMMENT '运行时配置: bucket/region/cdnDomain/uploadPrefix/maxFileSize/allowedMimeTypes等',
  priority INT NOT NULL DEFAULT 0 COMMENT '优先级',
  status VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active/inactive',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_provider (provider),
  INDEX idx_default (is_default),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='存储配置表';

CREATE TABLE IF NOT EXISTS files (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_no VARCHAR(32) NOT NULL COMMENT '文件编号',
  user_id BIGINT UNSIGNED NULL COMMENT '上传用户, NULL=系统文件',
  provider VARCHAR(32) NOT NULL COMMENT '存储提供商',
  storage_key VARCHAR(512) NOT NULL COMMENT '对象存储key(含路径前缀)',
  original_name VARCHAR(256) NOT NULL DEFAULT '' COMMENT '原始文件名',
  mime_type VARCHAR(128) NOT NULL DEFAULT '' COMMENT 'MIME类型',
  file_size INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '文件大小(字节)',
  width INT NOT NULL DEFAULT 0 COMMENT '图片/视频宽度',
  height INT NOT NULL DEFAULT 0 COMMENT '图片/视频高度',
  duration INT NOT NULL DEFAULT 0 COMMENT '视频时长(秒)',
  md5_hash VARCHAR(64) NOT NULL DEFAULT '' COMMENT '文件MD5',
  etag VARCHAR(64) NOT NULL DEFAULT '' COMMENT '对象存储ETag',
  access_url VARCHAR(1024) NOT NULL DEFAULT '' COMMENT '原始访问地址',
  cdn_url VARCHAR(1024) NOT NULL DEFAULT '' COMMENT 'CDN加速地址',
  file_category VARCHAR(32) NOT NULL DEFAULT 'general' COMMENT 'avatar/ref_image/ref_video/template_cover/ai_output/ai_video/general',
  visibility VARCHAR(16) NOT NULL DEFAULT 'private' COMMENT 'private/public',
  ref_type VARCHAR(32) NULL COMMENT '关联业务类型: task_output/template/user',
  ref_id VARCHAR(64) NULL COMMENT '关联业务ID',
  is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '软删除标记',
  deleted_at DATETIME(3) NULL COMMENT '软删除时间',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX uk_file_no (file_no),
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_provider_ref (provider, ref_type, ref_id),
  INDEX idx_md5 (md5_hash),
  INDEX idx_deleted (is_deleted),
  INDEX idx_category (file_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文件记录表';

CREATE TABLE IF NOT EXISTS file_upload_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_id BIGINT UNSIGNED NOT NULL COMMENT '关联files.id',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '上传用户',
  upload_mode VARCHAR(16) NOT NULL COMMENT 'server_relay/direct_client',
  file_size INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '上传文件大小',
  mime_type VARCHAR(128) NOT NULL DEFAULT '' COMMENT '文件类型',
  duration_ms INT NOT NULL DEFAULT 0 COMMENT '上传耗时(毫秒)',
  source_ip VARCHAR(45) NOT NULL DEFAULT '' COMMENT '客户端IP',
  user_agent VARCHAR(512) NOT NULL DEFAULT '' COMMENT '客户端UA',
  status VARCHAR(16) NOT NULL DEFAULT 'success' COMMENT 'success/failed/rejected',
  fail_reason VARCHAR(256) NOT NULL DEFAULT '' COMMENT '失败原因',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_file_id (file_id),
  INDEX idx_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='上传日志表';

CREATE TABLE IF NOT EXISTS file_delete_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  file_id BIGINT UNSIGNED NOT NULL COMMENT '关联files.id',
  user_id BIGINT UNSIGNED NULL COMMENT '操作用户',
  operator_type VARCHAR(16) NOT NULL DEFAULT 'user' COMMENT 'user/admin/system',
  delete_type VARCHAR(16) NOT NULL DEFAULT 'soft' COMMENT 'soft/hard',
  storage_key VARCHAR(512) NOT NULL COMMENT '被删文件的storage_key',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_file_id (file_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='删除日志表';
