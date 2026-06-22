const TOKEN_KEY = "ucc_token";
const USER_KEY  = "ucc_username";
const UID_KEY   = "ucc_uid";

export function getToken()    { return localStorage.getItem(TOKEN_KEY); }
export function getUsername() { return localStorage.getItem(USER_KEY); }
export function getUserId()   { return parseInt(localStorage.getItem(UID_KEY) || "0"); }
export function isLoggedIn()  { return !!getToken(); }

export function saveAuth(token, role, username, userId) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, username);
    localStorage.setItem(UID_KEY, String(userId));
}

export function clearAuth() {
    [TOKEN_KEY, USER_KEY, UID_KEY].forEach((k) => localStorage.removeItem(k));
}

export function isAdmin() {
    try {
        const user = JSON.parse(localStorage.getItem("ucc_user") || "null");
        return user?.role === "manager" || user?.role === "developer";
    } catch { return false; }
}
