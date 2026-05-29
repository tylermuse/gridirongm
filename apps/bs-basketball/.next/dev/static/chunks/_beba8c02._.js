(globalThis.TURBOPACK || (globalThis.TURBOPACK = [])).push([typeof document === "object" ? document.currentScript : undefined,
"[project]/packages/core/src/analytics/index.ts [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "trackEvent",
    ()=>trackEvent,
    "usePageView",
    ()=>usePageView
]);
/**
 * @bs/core/analytics — anonymous event tracking + page-view hook.
 *
 * Promoted from apps/web/src/lib/analytics.ts during Sub-phase 1D.
 *
 * Consumers must provide:
 *   - A React-compatible context (this is a 'use client' module)
 *   - A POST handler at /api/analytics/track that accepts the beacon payload
 *
 * The hook + function are sport-agnostic, which is why they live here rather
 * than in @bs/sport-football.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/index.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/navigation.js [app-client] (ecmascript)");
var _s = __turbopack_context__.k.signature();
'use client';
;
;
const DEVICE_ID_KEY = 'gg-device-id';
/** Stable anonymous device ID — persists across sessions via localStorage */ function getDeviceId() {
    try {
        let id = localStorage.getItem(DEVICE_ID_KEY);
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem(DEVICE_ID_KEY, id);
        }
        return id;
    } catch  {
        return null;
    }
}
function trackEvent(event, properties) {
    try {
        const deviceId = getDeviceId();
        navigator.sendBeacon('/api/analytics/track', JSON.stringify({
            event,
            properties,
            deviceId
        }));
    } catch  {
    // Silently fail — analytics should never break the app
    }
}
function usePageView() {
    _s();
    const pathname = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"])();
    const prev = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useRef"])(null);
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "usePageView.useEffect": ()=>{
            if (pathname === prev.current) return;
            prev.current = pathname;
            trackEvent('page_view', {
                path: pathname
            });
        }
    }["usePageView.useEffect"], [
        pathname
    ]);
    // Track session start once per browser session
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$index$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["useEffect"])({
        "usePageView.useEffect": ()=>{
            if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
            ;
            if (sessionStorage.getItem('gg_session')) return;
            sessionStorage.setItem('gg_session', '1');
            trackEvent('session_start');
        }
    }["usePageView.useEffect"], []);
}
_s(usePageView, "IwEIAQMpPXTcCTwxXq5RGMB66Pg=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$navigation$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePathname"]
    ];
});
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
"[project]/apps/bs-basketball/src/components/providers/Providers.tsx [app-client] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "Providers",
    ()=>Providers
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/compiled/react/jsx-dev-runtime.js [app-client] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$src$2f$analytics$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/packages/core/src/analytics/index.ts [app-client] (ecmascript)");
;
var _s = __turbopack_context__.k.signature();
'use client';
;
/**
 * BS Hoops app providers.
 *
 * v1 scope (2C-1): just analytics page-view tracking.
 *
 * Coming in later 2C slices:
 *   - SubscriptionProvider (shares Stripe customer with football — one sub
 *     unlocks both sports per the cross-sport billing decision)
 *   - SupabaseProvider (shares the football Supabase project for ONE user
 *     account across sports)
 *   - SimEngineProvider (basketballAdapter passed through context)
 *   - ThemeProvider (light/dark toggle, persisted to localStorage)
 */ function PageViewTracker() {
    _s();
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$src$2f$analytics$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePageView"])();
    return null;
}
_s(PageViewTracker, "KiMXu6rpTKz6f9xvaoMcGXkbpfY=", false, function() {
    return [
        __TURBOPACK__imported__module__$5b$project$5d2f$packages$2f$core$2f$src$2f$analytics$2f$index$2e$ts__$5b$app$2d$client$5d$__$28$ecmascript$29$__["usePageView"]
    ];
});
_c = PageViewTracker;
function Providers({ children }) {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["Fragment"], {
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$compiled$2f$react$2f$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$client$5d$__$28$ecmascript$29$__["jsxDEV"])(PageViewTracker, {}, void 0, false, {
                fileName: "[project]/apps/bs-basketball/src/components/providers/Providers.tsx",
                lineNumber: 28,
                columnNumber: 7
            }, this),
            children
        ]
    }, void 0, true);
}
_c1 = Providers;
var _c, _c1;
__turbopack_context__.k.register(_c, "PageViewTracker");
__turbopack_context__.k.register(_c1, "Providers");
if (typeof globalThis.$RefreshHelpers$ === 'object' && globalThis.$RefreshHelpers !== null) {
    __turbopack_context__.k.registerExports(__turbopack_context__.m, globalThis.$RefreshHelpers$);
}
}),
]);

//# sourceMappingURL=_beba8c02._.js.map