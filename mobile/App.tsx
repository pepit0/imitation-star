import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import {
  addCustomerInfoListener,
  configureRevenueCat,
  fetchSubscriptionStatus,
  handleWebSubscriptionMessage,
  injectSubscriptionStatusScript,
  isRevenueCatConfigured,
} from "./revenueCat";
import type { NativeSubscriptionStatus } from "./subscriptionConstants";

const DEFAULT_ORIGIN = "https://www.imitation.site";
/** Brand coral — fills notch / hole-punch / home-indicator areas. */
const SHELL_BG = "#FF595E";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function resolveStartUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_APP_URL?.trim();
  const origin = (fromEnv || DEFAULT_ORIGIN).replace(/\/$/, "");
  return `${origin}/play?client=app`;
}

function resolveWebOrigin(): string {
  const fromEnv = process.env.EXPO_PUBLIC_APP_URL?.trim();
  return (fromEnv || DEFAULT_ORIGIN).replace(/\/$/, "");
}

async function registerForPushAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Imitation Star",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF595E",
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;

  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId || typeof projectId !== "string") return null;

  const token = (
    await Notifications.getExpoPushTokenAsync({ projectId })
  ).data;
  return token || null;
}

function injectPushTokenScript(token: string, platform: string): string {
  const safeToken = JSON.stringify(token);
  const safePlatform = JSON.stringify(platform);
  return `
    (function() {
      try {
        window.__IMITATION_PUSH_TOKEN__ = ${safeToken};
        window.__IMITATION_PUSH_PLATFORM__ = ${safePlatform};
        window.dispatchEvent(new CustomEvent('imitation-push-token', {
          detail: { token: ${safeToken}, platform: ${safePlatform} }
        }));
      } catch (e) {}
      true;
    })();
  `;
}

export default function App() {
  const webRef = useRef<WebView>(null);
  const startUrl = useMemo(() => resolveStartUrl(), []);
  const webOrigin = useMemo(() => resolveWebOrigin(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const subscriptionStatusRef = useRef<NativeSubscriptionStatus | null>(null);

  const injectSubscriptionStatus = useCallback((status: NativeSubscriptionStatus) => {
    subscriptionStatusRef.current = status;
    webRef.current?.injectJavaScript(injectSubscriptionStatusScript(status));
  }, []);

  useEffect(() => {
    configureRevenueCat();
    if (!isRevenueCatConfigured()) return;

    let cancelled = false;
    void fetchSubscriptionStatus().then((status) => {
      if (!cancelled) injectSubscriptionStatus(status);
    });

    const removeListener = addCustomerInfoListener((status) => {
      injectSubscriptionStatus(status);
    });

    return () => {
      cancelled = true;
      removeListener();
    };
  }, [injectSubscriptionStatus]);

  useEffect(() => {
    let cancelled = false;
    void registerForPushAsync().then((token) => {
      if (!cancelled && token) setPushToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pushToken || !webRef.current) return;
    webRef.current.injectJavaScript(
      injectPushTokenScript(pushToken, Platform.OS)
    );
  }, [pushToken, loading]);

  const reload = useCallback(() => {
    setError(null);
    setLoading(true);
    webRef.current?.reload();
  }, []);

  const onNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as {
        type?: string;
        postId?: string;
        packId?: string;
      };
      let path = "/play?client=app";
      if (data?.postId) {
        path = `/forum?client=app&post=${encodeURIComponent(data.postId)}`;
      } else if (data?.type === "followee_pack" || data?.type === "pack_used") {
        path = `/packs?client=app`;
      } else if (data?.type === "follow") {
        path = `/profile?client=app`;
      }
      const url = `${webOrigin}${path.startsWith("/") ? path : `/${path}`}`;
      webRef.current?.injectJavaScript(
        `window.location.href = ${JSON.stringify(url)}; true;`
      );
    },
    [webOrigin]
  );

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      onNotificationResponse
    );
    return () => sub.remove();
  }, [onNotificationResponse]);

  const onWebMessage = useCallback(
    (raw: string) => {
      void (async () => {
        const result = await handleWebSubscriptionMessage(raw);
        if (result.status) {
          injectSubscriptionStatus(result.status);
        }
      })();
    },
    [injectSubscriptionStatus]
  );

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar
          translucent
          backgroundColor="transparent"
          barStyle="light-content"
        />

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Couldn’t load the app</Text>
            <Text style={styles.errorBody}>{error}</Text>
            <Text style={styles.errorHint}>
              URL: {startUrl}
              {"\n"}
              On a device, use your computer’s LAN IP for local Next.js, e.g.
              http://192.168.x.x:3000
            </Text>
            <Pressable onPress={reload} style={styles.retry}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.webWrap}>
            <WebView
              ref={webRef}
              source={{ uri: startUrl }}
              style={styles.webview}
              onLoadStart={() => {
                setLoading(true);
                setError(null);
              }}
              onLoadEnd={() => {
                setLoading(false);
                if (pushToken) {
                  webRef.current?.injectJavaScript(
                    injectPushTokenScript(pushToken, Platform.OS)
                  );
                }
                if (subscriptionStatusRef.current) {
                  webRef.current?.injectJavaScript(
                    injectSubscriptionStatusScript(
                      subscriptionStatusRef.current
                    )
                  );
                }
              }}
              onError={(e) => {
                setLoading(false);
                setError(e.nativeEvent.description || "Network error");
              }}
              onHttpError={(e) => {
                if (e.nativeEvent.statusCode >= 500) {
                  setError(`Server error (${e.nativeEvent.statusCode})`);
                }
              }}
              onMessage={(event) => onWebMessage(event.nativeEvent.data)}
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              allowsBackForwardNavigationGestures
              setSupportMultipleWindows={false}
              mediaCapturePermissionGrantType="grant"
              {...(Platform.OS === "android"
                ? {
                    mixedContentMode: "compatibility" as const,
                    allowsFullscreenVideo: true,
                  }
                : {})}
            />
            {loading ? (
              <View style={styles.loading} pointerEvents="none">
                <ActivityIndicator color="#fff" size="large" />
              </View>
            ) : null}
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SHELL_BG,
  },
  webWrap: {
    flex: 1,
    backgroundColor: SHELL_BG,
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,89,94,0.85)",
  },
  errorBox: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    gap: 12,
    backgroundColor: SHELL_BG,
  },
  errorTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  errorBody: {
    color: "#111",
    fontSize: 14,
  },
  errorHint: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    lineHeight: 18,
  },
  retry: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#111",
    borderWidth: 2,
    borderColor: "#000",
  },
  retryText: {
    color: "#fff",
    fontWeight: "800",
    textTransform: "uppercase",
  },
});
