import { escapeHtml } from '../dom.js';
import { formatDateTime } from '../format.js';
export function usersSkeleton() {
    return `<div class="users-page" aria-busy="true" aria-label="正在加载用户">
    <div class="skeleton skeleton--line" style="width: 220px"></div>
    <div class="skeleton skeleton--analytics"></div>
  </div>`;
}
export function usersHtml(data) {
    const admins = data.users.filter((user) => user.role === 'admin').length;
    const normal = data.users.filter((user) => user.role === 'user').length;
    return `<div class="users-page">
    <header class="users-hero">
      <div>
        <span class="users-hero__eyebrow">DEMO USER DIRECTORY</span>
        <h1>用户管理</h1>
        <p>管理员创建普通用户；普通用户可检索、阅读和批注。</p>
      </div>
      <div class="users-hero__stats">
        <span><strong>${admins}</strong> 管理员</span>
        <span><strong>${normal}</strong> 普通用户</span>
      </div>
    </header>

    <div class="users-grid">
      <section class="users-card users-card--form">
        <div class="users-card__head">
          <div>
            <span class="users-card__eyebrow">CREATE ACCOUNT</span>
            <h2>创建普通用户</h2>
          </div>
        </div>
        <form class="users-form" data-user-form>
          <label>
            登录名
            <input name="username" autocomplete="off" required minlength="3" maxlength="32"
              pattern="[A-Za-z0-9._-]+" placeholder="如：reader01">
          </label>
          <label>
            显示名
            <input name="displayName" autocomplete="off" required maxlength="40" placeholder="如：读者一号">
          </label>
          <label>
            初始密码
            <input name="password" type="password" autocomplete="new-password" required
              minlength="8" maxlength="128" placeholder="至少 8 位">
          </label>
          <p class="users-form__hint">普通用户不可创建其他用户，也不能进入用户管理。</p>
          <div class="users-form__foot">
            <span data-user-status></span>
            <button class="btn btn--primary" type="submit">创建用户</button>
          </div>
        </form>
      </section>

      <section class="users-card">
        <div class="users-card__head">
          <div>
            <span class="users-card__eyebrow">ACCOUNTS</span>
            <h2>账号列表</h2>
          </div>
          <span class="users-card__count">${data.users.length} 个账号</span>
        </div>
        <div class="users-table-wrap">
          <table class="users-table">
            <thead>
              <tr><th>登录名</th><th>显示名</th><th>角色</th><th>创建时间</th></tr>
            </thead>
            <tbody>
              ${data.users
        .map((user) => `<tr>
                    <td><code>${escapeHtml(user.username)}</code></td>
                    <td>${escapeHtml(user.displayName)}</td>
                    <td><span class="users-role users-role--${user.role}">${user.role === 'admin' ? '管理员' : '普通用户'}</span></td>
                    <td>${formatDateTime(user.createdAt)}</td>
                  </tr>`)
        .join('')}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>`;
}
