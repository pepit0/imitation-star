import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

const DEFAULT_ORIGIN = "https://imitation-star.vercel.app";
/** Brand coral — fills notch / hole-punch / home-indicator areas. */
const SHELL_BG = "#FF595E";

function resolveStartUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_APP_URL?.trim();
  const origin = (fromEnv || DEFAULT_ORIGIN).replace(/\/$/, "");
  return `${origin}/play?client=app`;
}

export default function App() {
  const webRef = useRef<WebView>(null);
  const startUrl = useMemo(() => resolveStartUrl(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setError(null);
    setLoading(true);
    webRef.current?.reload();
  }, []);

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
              onLoadEnd={() => setLoading(false)}
              onError={(e) => {
                setLoading(false);
                setError(e.nativeEvent.description || "Network error");
              }}
              onHttpError={(e) => {
                if (e.nativeEvent.statusCode >= 500) {
                  setError(`Server error (${e.nativeEvent.statusCode})`);
                }
              }}
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
