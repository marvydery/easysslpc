"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Settings, Users, BarChart3, Key, DollarSign, Globe,
  Shield, Bell, Search, ChevronDown, Trash2, UserX,
  UserCheck, Crown, RefreshCw, LogIn, Save, X, Lock,
  Eye, EyeOff, AlertTriangle, CheckCircle2
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type Tab = "overview" | "users" | "pricing" | "keys" | "site" | "analytics";

type Stats = {
  totalUsers: number;
  freeUsers: number;
  proUsers: number;
  lifetimeUsers: number;
  suspendedUsers: number;
  totalDomains: number;
  totalCerts: number;
  newUsersThisMonth: number;
};

type AdminUser = {
  id: string;
  email: string;
  clerkId: string;
  subscriptionTier: "free" | "pro" | "lifetime";
  isAdmin: boolean;
  isSuspended: boolean;
  domainCount: number;
  certCount: number;
  createdAt: string;
};

type Settings = Record<string, string>;

// ─── Toast ───────────────────────────────────────────────────────────────────
function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl text-white text-sm font-medium transition-all ${type === "success" ? "bg-green-600" : "bg-red-600"}`}>
      {type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
      {message}
      <button onClick={onClose}><X className="w-4 h-4 opacity-70 hover:opacity-100" /></button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [localSettings, setLocalSettings] = useState<Settings>({});

  const showToast = (message: string, type: "success" | "error") => setToast({ message, type });

  // ── Fetch data ──────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/admin/stats");
    const data = await res.json();
    if (data.success) setStats(data.stats);
  }, []);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    if (data.success) setAllUsers(data.users);
  }, []);

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/admin/settings");
    const data = await res.json();
    if (data.success) {
      setSettings(data.settings);
      setLocalSettings(data.settings);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchSettings();
  }, []);

  useEffect(() => {
    if (activeTab === "users" && allUsers.length === 0) fetchUsers();
  }, [activeTab]);

  // ── Save settings ───────────────────────────────────────────────────────────
  async function saveSettings(subset: Settings) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subset),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSettings((prev) => ({ ...prev, ...subset }));
      showToast("Settings saved successfully", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to save", "error");
    } finally {
      setLoading(false);
    }
  }

  // ── User actions ─────────────────────────────────────────────────────────────
  async function userAction(action: string, userId: string, extra?: object) {
    if (action === "delete" && !confirm("Delete this user and all their data? This cannot be undone.")) return;
    setActionLoading(`${action}-${userId}`);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetUserId: userId, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (action === "impersonate" && data.token) {
        window.open(`/api/auth/impersonate?token=${data.token}`, "_blank");
      } else {
        showToast(data.message, "success");
        fetchUsers();
      }
    } catch (err: any) {
      showToast(err.message || "Action failed", "error");
    } finally {
      setActionLoading(null);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const filteredUsers = allUsers.filter(
    (u) =>
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.subscriptionTier.includes(searchQuery.toLowerCase())
  );

  const tierBadge = (tier: string, suspended: boolean) => {
    if (suspended) return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 font-medium">Suspended</span>;
    const colors: Record<string, string> = {
      free: "bg-gray-100 text-gray-700",
      pro: "bg-blue-100 text-blue-700",
      lifetime: "bg-purple-100 text-purple-700",
    };
    return <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${colors[tier]}`}>{tier}</span>;
  };

  const ghs = (pesewas: string | number) => `GHS ${(Number(pesewas) / 100).toFixed(2)}`;
  const usd = (pesewas: string | number, rate: string) =>
    `~$${(Number(pesewas) / 100 / Number(rate || 12)).toFixed(2)}`;

  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "users", label: "Users", icon: Users },
    { id: "pricing", label: "Pricing", icon: DollarSign },
    { id: "keys", label: "API Keys", icon: Key },
    { id: "site", label: "Site", icon: Globe },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900">EasySSL Admin</h1>
            <p className="text-xs text-gray-500">System Management</p>
          </div>
        </div>
        <button
          onClick={() => router.push("/dashboard")}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          ← Back to Dashboard
        </button>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-56 bg-white border-r min-h-screen p-4 space-y-1">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === id
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 p-6 space-y-6">

          {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900">Overview</h2>
              {stats ? (
                <>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: "Total Users", value: stats.totalUsers, color: "blue" },
                      { label: "Active Certs", value: stats.totalCerts, color: "green" },
                      { label: "Pro Users", value: stats.proUsers, color: "blue" },
                      { label: "Lifetime Users", value: stats.lifetimeUsers, color: "purple" },
                      { label: "Free Users", value: stats.freeUsers, color: "gray" },
                      { label: "Total Domains", value: stats.totalDomains, color: "indigo" },
                      { label: "Suspended", value: stats.suspendedUsers, color: "red" },
                      { label: "New This Month", value: stats.newUsersThisMonth, color: "green" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-white rounded-xl border p-5">
                        <p className="text-sm text-gray-500 mb-1">{label}</p>
                        <p className={`text-3xl font-bold text-${color}-600`}>{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white rounded-xl border p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">User Distribution</h3>
                    <div className="space-y-3">
                      {[
                        { label: "Free", count: stats.freeUsers, color: "bg-gray-400" },
                        { label: "Pro", count: stats.proUsers, color: "bg-blue-500" },
                        { label: "Lifetime", count: stats.lifetimeUsers, color: "bg-purple-500" },
                      ].map(({ label, count, color }) => (
                        <div key={label} className="flex items-center gap-3">
                          <span className="text-sm text-gray-600 w-16">{label}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-3">
                            <div
                              className={`h-3 rounded-full ${color}`}
                              style={{ width: stats.totalUsers ? `${(count / stats.totalUsers) * 100}%` : "0%" }}
                            />
                          </div>
                          <span className="text-sm font-medium text-gray-700 w-8 text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-40">
                  <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
                </div>
              )}
            </div>
          )}

          {/* ── USERS ────────────────────────────────────────────────────── */}
          {activeTab === "users" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">User Management</h2>
                <button onClick={fetchUsers} className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  <RefreshCw className="w-4 h-4" /> Refresh
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by email or tier..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="bg-white rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tier</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Domains</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Certs</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className={user.isSuspended ? "bg-red-50" : ""}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 truncate max-w-[200px]">{user.email}</div>
                          {user.isAdmin && <span className="text-xs text-orange-600 font-medium">Admin</span>}
                        </td>
                        <td className="px-4 py-3">{tierBadge(user.subscriptionTier, user.isSuspended)}</td>
                        <td className="px-4 py-3 text-gray-700">{user.domainCount}</td>
                        <td className="px-4 py-3 text-gray-700">{user.certCount}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          {!user.isAdmin && (
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Change tier */}
                              <select
                                defaultValue={user.subscriptionTier}
                                onChange={(e) => userAction("change_tier", user.id, { tier: e.target.value })}
                                disabled={!!actionLoading}
                                className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="free">Free</option>
                                <option value="pro">Pro</option>
                                <option value="lifetime">Lifetime</option>
                              </select>

                              {/* Suspend/Unsuspend */}
                              <button
                                onClick={() => userAction(user.isSuspended ? "unsuspend" : "suspend", user.id)}
                                disabled={actionLoading === `${user.isSuspended ? "unsuspend" : "suspend"}-${user.id}`}
                                title={user.isSuspended ? "Unsuspend" : "Suspend"}
                                className={`p-1.5 rounded-lg border transition-colors ${
                                  user.isSuspended
                                    ? "border-green-300 text-green-600 hover:bg-green-50"
                                    : "border-yellow-300 text-yellow-600 hover:bg-yellow-50"
                                }`}
                              >
                                {user.isSuspended ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                              </button>

                              {/* Impersonate */}
                              <button
                                onClick={() => userAction("impersonate", user.id)}
                                disabled={!!actionLoading}
                                title="Impersonate user"
                                className="p-1.5 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-50"
                              >
                                <LogIn className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => userAction("delete", user.id)}
                                disabled={!!actionLoading}
                                title="Delete user"
                                className="p-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-10 text-gray-400">No users found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── PRICING ──────────────────────────────────────────────────── */}
          {activeTab === "pricing" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900">Pricing Management</h2>
              <div className="bg-white rounded-xl border p-6 space-y-6 max-w-xl">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">USD → GHS Peg Rate</label>
                  <input
                    type="number"
                    value={localSettings["usd_to_ghs_rate"] ?? "12"}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, usd_to_ghs_rate: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 12"
                  />
                  <p className="text-xs text-gray-500 mt-1">Used to display USD equivalent in the dashboard</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <select
                    value={localSettings["paystack_currency"] ?? "GHS"}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, paystack_currency: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="GHS">GHS — Ghanaian Cedi</option>
                    <option value="NGN">NGN — Nigerian Naira</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="KES">KES — Kenyan Shilling</option>
                  </select>
                </div>

                {[
                  { key: "paystack_pro_amount", label: "Pro Plan Amount (pesewas)", usdLabel: "Pro" },
                  { key: "paystack_lifetime_amount", label: "Lifetime Plan Amount (pesewas)", usdLabel: "Lifetime" },
                ].map(({ key, label, usdLabel }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                    <input
                      type="number"
                      value={localSettings[key] ?? ""}
                      onChange={(e) => setLocalSettings((p) => ({ ...p, [key]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. 34800"
                    />
                    {localSettings[key] && (
                      <p className="text-xs text-gray-500 mt-1">
                        = {ghs(localSettings[key])} &nbsp;·&nbsp;
                        {usd(localSettings[key], localSettings["usd_to_ghs_rate"])}
                      </p>
                    )}
                  </div>
                ))}

                <button
                  onClick={() => saveSettings({
                    paystack_pro_amount: localSettings["paystack_pro_amount"],
                    paystack_lifetime_amount: localSettings["paystack_lifetime_amount"],
                    paystack_currency: localSettings["paystack_currency"],
                    usd_to_ghs_rate: localSettings["usd_to_ghs_rate"],
                  })}
                  disabled={loading}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {loading ? "Saving..." : "Save Pricing"}
                </button>
              </div>
            </div>
          )}

          {/* ── API KEYS ─────────────────────────────────────────────────── */}
          {activeTab === "keys" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900">API Keys</h2>
              <div className="bg-white rounded-xl border p-6 space-y-6 max-w-xl">

                {/* ACME environment */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ACME Environment</label>
                  <select
                    value={localSettings["acme_environment"] ?? "production"}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, acme_environment: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="production">Production (Let's Encrypt)</option>
                    <option value="staging">Staging (Testing only)</option>
                  </select>
                  <p className="text-xs text-orange-600 mt-1">⚠️ Staging certificates are not trusted by browsers</p>
                </div>

                {/* Paystack keys */}
                {[
                  { key: "paystack_public_key", label: "Paystack Public Key", prefix: "pk_" },
                  { key: "paystack_secret_key", label: "Paystack Secret Key", prefix: "sk_" },
                ].map(({ key, label, prefix }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                    <div className="relative">
                      <input
                        type={showSecret[key] ? "text" : "password"}
                        value={localSettings[key] ?? ""}
                        onChange={(e) => setLocalSettings((p) => ({ ...p, [key]: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={`${prefix}live_...`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret((p) => ({ ...p, [key]: !p[key] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showSecret[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-xs text-yellow-800">
                    <strong>Note:</strong> Keys saved here override environment variables. 
                    Paystack secret key is sensitive — only change if you're rotating keys.
                  </p>
                </div>

                <button
                  onClick={() => saveSettings({
                    acme_environment: localSettings["acme_environment"],
                    paystack_public_key: localSettings["paystack_public_key"],
                    paystack_secret_key: localSettings["paystack_secret_key"],
                  })}
                  disabled={loading}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {loading ? "Saving..." : "Save Keys"}
                </button>
              </div>
            </div>
          )}

          {/* ── SITE ─────────────────────────────────────────────────────── */}
          {activeTab === "site" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900">Site Management</h2>
              <div className="bg-white rounded-xl border p-6 space-y-6 max-w-xl">

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Site Name</label>
                  <input
                    type="text"
                    value={localSettings["site_name"] ?? "EasySSL"}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, site_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
                  <input
                    type="url"
                    value={localSettings["site_logo_url"] ?? ""}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, site_logo_url: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Announcement Banner</label>
                  <textarea
                    value={localSettings["announcement_banner"] ?? ""}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, announcement_banner: e.target.value }))}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Leave empty to hide banner"
                  />
                </div>

                {/* Maintenance mode */}
                <div className="flex items-center justify-between p-4 border border-red-200 bg-red-50 rounded-lg">
                  <div>
                    <p className="font-medium text-red-800 text-sm">Maintenance Mode</p>
                    <p className="text-xs text-red-600 mt-0.5">Blocks all non-admin users from accessing the site</p>
                  </div>
                  <button
                    onClick={() => setLocalSettings((p) => ({
                      ...p,
                      maintenance_mode: p["maintenance_mode"] === "true" ? "false" : "true"
                    }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      localSettings["maintenance_mode"] === "true" ? "bg-red-600" : "bg-gray-300"
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      localSettings["maintenance_mode"] === "true" ? "translate-x-6" : "translate-x-1"
                    }`} />
                  </button>
                </div>

                {localSettings["maintenance_mode"] === "true" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Maintenance Message</label>
                    <textarea
                      value={localSettings["maintenance_message"] ?? ""}
                      onChange={(e) => setLocalSettings((p) => ({ ...p, maintenance_message: e.target.value }))}
                      rows={2}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="We'll be back shortly..."
                    />
                  </div>
                )}

                <button
                  onClick={() => saveSettings({
                    site_name: localSettings["site_name"],
                    site_logo_url: localSettings["site_logo_url"],
                    announcement_banner: localSettings["announcement_banner"],
                    maintenance_mode: localSettings["maintenance_mode"],
                    maintenance_message: localSettings["maintenance_message"],
                  })}
                  disabled={loading}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {loading ? "Saving..." : "Save Site Settings"}
                </button>
              </div>
            </div>
          )}

          {/* ── ANALYTICS ────────────────────────────────────────────────── */}
          {activeTab === "analytics" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900">Google Analytics</h2>
              <div className="bg-white rounded-xl border p-6 space-y-6 max-w-xl">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">GA Measurement ID</label>
                  <input
                    type="text"
                    value={localSettings["ga_measurement_id"] ?? ""}
                    onChange={(e) => setLocalSettings((p) => ({ ...p, ga_measurement_id: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="G-XXXXXXXXXX"
                  />
                  <p className="text-xs text-gray-500 mt-1">Found in your Google Analytics → Admin → Data Streams</p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-blue-800 space-y-2">
                  <p className="font-semibold">After saving your GA ID:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Add this to your <code>src/app/layout.tsx</code>:</li>
                  </ol>
                  <pre className="bg-white border border-blue-200 rounded p-2 mt-2 overflow-x-auto text-xs">{`import Script from "next/script";
// In your <head>:
<Script
  src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXX"
  strategy="afterInteractive"
/>
<Script id="ga" strategy="afterInteractive">
  {\`window.dataLayer=window.dataLayer||[];
  function gtag(){dataLayer.push(arguments)}
  gtag('js',new Date());
  gtag('config','G-XXXXXX');\`}
</Script>`}</pre>
                </div>

                <button
                  onClick={() => saveSettings({ ga_measurement_id: localSettings["ga_measurement_id"] })}
                  disabled={loading}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {loading ? "Saving..." : "Save GA Settings"}
                </button>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
