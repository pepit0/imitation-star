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
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

const DEFAULT_ORIGIN = "https://imitation-star.vercel.app";

function resolveStartUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_APP_URL?.trim();
  const origin = (fromEnv || DEFAULT_ORIGIN).replace(/\/$/, "");
  // Game-only shell: land on MainMenu with native-app chrome flags.
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
      <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
        <StatusBar barStyle="light-content" backgroundColor="#0c0e10" />

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
                <ActivityIndicator color="#FF595E" size="large" />
              </View>
            ) : null}
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0c0e10",
  },
  webWrap: {
    flex: 1,
    position: "relative",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0c0e10",
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(12,14,16,0.55)",
  },
  errorBox: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    gap: 12,
  },
  errorTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  errorBody: {
    color: "#FF595E",
    fontSize: 14,
  },
  errorHint: {
    color: "#8b929a",
    fontSize: 12,
    lineHeight: 18,
  },
  retry: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#FF595E",
    borderWidth: 2,
    borderColor: "#000",
  },
  retryText: {
    color: "#fff",
    fontWeight: "800",
    textTransform: "uppercase",
  },
});
