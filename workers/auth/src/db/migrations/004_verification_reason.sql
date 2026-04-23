-- 添加 verification_reason 列：用户申请 GeoPass 时填写的自我说明
ALTER TABLE users ADD COLUMN verification_reason TEXT;
