/**
 * 公开仓库不带可登录的管理员密码。`password` 留空，未设置 `ADMIN_PASSWORD` 时无法登录。
 * `phone` 只是占位号（不是真实号码），可用 `ADMIN_PHONE` 覆盖。不要把密码写进这个文件。
 */
export const adminConfig = {
  phone: '13800138000',
  password: '',
};
