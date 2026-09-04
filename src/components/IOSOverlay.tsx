import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type RenderChildren = ReactNode | ((dismiss: () => void) => ReactNode);

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  children: RenderChildren;
  style?: StyleProp<ViewStyle>;
  handleColor: string;
  backdropOpacity?: number;
  scrollAtTop?: boolean;
};

type DialogProps = {
  visible: boolean;
  onClose: () => void;
  children: RenderChildren;
  style?: StyleProp<ViewStyle>;
  backdropOpacity?: number;
  dismissOnBackdrop?: boolean;
};

const SPRING = { stiffness: 300, damping: 31, mass: 0.9, useNativeDriver: true } as const;
const WEB_GLASS = Platform.OS === 'web'
  ? ({ backdropFilter: 'blur(18px) saturate(1.18)', WebkitBackdropFilter: 'blur(18px) saturate(1.18)' } as any)
  : undefined;
const WEB_TRANSFORM_LAYER = Platform.OS === 'web'
  ? ({ willChange: 'transform', backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' } as any)
  : undefined;
const WEB_OPACITY_LAYER = Platform.OS === 'web'
  ? ({ willChange: 'opacity' } as any)
  : undefined;

function webScrollAtTop(event: unknown, fallback: boolean): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof HTMLElement === 'undefined') return fallback;
  const candidate = (event as { target?: unknown; nativeEvent?: { target?: unknown } })?.target
    ?? (event as { nativeEvent?: { target?: unknown } })?.nativeEvent?.target;
  if (!(candidate instanceof HTMLElement)) return fallback;

  let node: HTMLElement | null = candidate;
  while (node) {
    const overflowY = window.getComputedStyle(node).overflowY;
    const scrollable = (overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1;
    if (scrollable) return node.scrollTop <= 1;
    node = node.parentElement;
  }
  return fallback;
}

export function IOSSheet({ visible, onClose, children, style, handleColor, backdropOpacity = 0.46, scrollAtTop = true }: SheetProps) {
  const [mounted, setMounted] = useState(visible);
  const presentation = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const sheetHeight = useRef(640);
  const scrollAtTopRef = useRef(scrollAtTop);
  const gestureStartedAtTop = useRef(scrollAtTop);

  useEffect(() => { scrollAtTopRef.current = scrollAtTop; }, [scrollAtTop]);

  const animateOut = useCallback((notify: boolean) => {
    if (closing.current) return;
    closing.current = true;
    const distance = Math.max(360, sheetHeight.current + 48);
    Animated.parallel([
      Animated.timing(presentation, {
        toValue: 0,
        duration: 205,
        easing: Easing.bezier(0.32, 0.72, 0, 1),
        useNativeDriver: true,
        isInteraction: false,
      }),
      Animated.timing(dragY, {
        toValue: distance,
        duration: 235,
        easing: Easing.bezier(0.32, 0.72, 0, 1),
        useNativeDriver: true,
        isInteraction: false,
      }),
    ]).start(() => {
      setMounted(false);
      if (notify) onClose();
    });
  }, [dragY, onClose, presentation]);

  const dismiss = useCallback(() => animateOut(true), [animateOut]);

  useEffect(() => {
    if (!visible) {
      if (mounted && !closing.current) animateOut(false);
      closing.current = false;
      return;
    }
    if (!mounted && !closing.current) setMounted(true);
  }, [animateOut, mounted, visible]);

  useEffect(() => {
    if (!mounted || !visible || closing.current) return;
    presentation.stopAnimation();
    dragY.stopAnimation();
    presentation.setValue(0);
    dragY.setValue(0);
    requestAnimationFrame(() => {
      Animated.spring(presentation, { toValue: 1, ...SPRING, isInteraction: false }).start();
    });
  }, [dragY, mounted, presentation, visible]);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: (event) => {
      gestureStartedAtTop.current = webScrollAtTop(event, scrollAtTopRef.current);
      return false;
    },
    onMoveShouldSetPanResponder: (_, gesture) => gestureStartedAtTop.current && gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.15,
    onPanResponderGrant: () => dragY.stopAnimation(),
    onPanResponderMove: (_, gesture) => {
      const raw = Math.max(0, gesture.dy);
      const resisted = raw <= 300 ? raw : 300 + (raw - 300) * 0.28;
      dragY.setValue(resisted);
    },
    onPanResponderRelease: (_, gesture) => {
      const fast = gesture.dy > 20 && gesture.vy > 0.68;
      if (gesture.dy > 82 || fast) dismiss();
      else Animated.spring(dragY, { toValue: 0, ...SPRING, velocity: gesture.vy, isInteraction: false }).start();
    },
    onPanResponderTerminate: () => Animated.spring(dragY, { toValue: 0, ...SPRING, isInteraction: false }).start(),
    onPanResponderTerminationRequest: () => true,
  }), [dismiss, dragY]);

  if (!mounted) return null;

  const introY = presentation.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  const translateY = Animated.add(introY, dragY);
  const baseDim = presentation.interpolate({
    inputRange: [0, 0.28, 1],
    outputRange: [0, backdropOpacity, backdropOpacity],
    extrapolate: 'clamp',
  });
  const dragDim = dragY.interpolate({ inputRange: [0, 480], outputRange: [1, 0], extrapolate: 'clamp' });
  const dimOpacity = Animated.multiply(baseDim, dragDim);
  const content = typeof children === 'function' ? children(dismiss) : children;

  return <Modal visible transparent animationType="none" presentationStyle="overFullScreen" onRequestClose={dismiss}>
    <View style={styles.fill}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, WEB_OPACITY_LAYER, { opacity: dimOpacity }]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Close overlay" />
      <Animated.View
        pointerEvents="box-none"
        accessibilityViewIsModal
        style={[styles.sheetMotion, WEB_TRANSFORM_LAYER, { transform: [{ translateY }] }]}
      >
        <View
          onLayout={(event) => { sheetHeight.current = event.nativeEvent.layout.height; }}
          style={[styles.sheetBase, WEB_GLASS, style]}
          {...responder.panHandlers}
        >
          <View style={styles.grabberTouch}>
            <View style={[styles.grabber, { backgroundColor: handleColor }]} />
          </View>
          {content}
        </View>
      </Animated.View>
    </View>
  </Modal>;
}

export function IOSDialog({ visible, onClose, children, style, backdropOpacity = 0.46, dismissOnBackdrop = true }: DialogProps) {
  const [mounted, setMounted] = useState(visible);
  const presentation = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const closing = useRef(false);

  const animateOut = useCallback((notify: boolean) => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(presentation, {
      toValue: 0,
      duration: 155,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    }).start(() => {
      setMounted(false);
      if (notify) onClose();
    });
  }, [onClose, presentation]);

  const dismiss = useCallback(() => animateOut(true), [animateOut]);

  useEffect(() => {
    if (!visible) {
      if (mounted && !closing.current) animateOut(false);
      closing.current = false;
      return;
    }
    if (!mounted && !closing.current) setMounted(true);
  }, [animateOut, mounted, visible]);

  useEffect(() => {
    if (!mounted || !visible || closing.current) return;
    presentation.stopAnimation();
    presentation.setValue(0);
    Animated.spring(presentation, { toValue: 1, stiffness: 420, damping: 32, mass: 0.72, useNativeDriver: true, isInteraction: false }).start();
  }, [mounted, presentation, visible]);

  if (!mounted) return null;

  const scale = presentation.interpolate({ inputRange: [0, 1], outputRange: [0.93, 1] });
  const translateY = presentation.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  const dimOpacity = presentation.interpolate({ inputRange: [0, 1], outputRange: [0, backdropOpacity] });
  const content = typeof children === 'function' ? children(dismiss) : children;

  return <Modal visible transparent animationType="none" presentationStyle="overFullScreen" onRequestClose={dismiss}>
    <View style={[styles.fill, styles.dialogHost]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, WEB_OPACITY_LAYER, { opacity: dimOpacity }]} />
      {dismissOnBackdrop && <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Close dialog" />}
      <Animated.View accessibilityViewIsModal style={[WEB_GLASS, WEB_TRANSFORM_LAYER, style, { opacity: presentation, transform: [{ translateY }, { scale }] }]}>
        {content}
      </Animated.View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  dim: { backgroundColor: '#000' },
  sheetMotion: {
    width: '100%',
    height: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  sheetBase: {
    width: '100%',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.16,
    shadowRadius: 26,
    elevation: 24,
  },
  grabberTouch: { height: 28, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 36, height: 5, borderRadius: 3, opacity: 0.66 },
  dialogHost: { alignItems: 'center', justifyContent: 'center', padding: 20 },
});
