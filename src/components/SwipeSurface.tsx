import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing, PanResponder, Platform, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { swipeAxis, type SwipeAxis } from '@/src/domain/gesture';
import { softHaptic } from './haptics';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
  dominance?: number;
};

const RETURN_SPRING = { stiffness: 255, damping: 29, mass: 0.92, useNativeDriver: true } as const;
const ENTRY_SPRING = { stiffness: 275, damping: 31, mass: 0.9, useNativeDriver: true } as const;
const PAGE_EASING = Easing.bezier(0.22, 0.78, 0, 1);
const WEB_COMPOSITE = Platform.OS === 'web' ? ({ willChange: 'transform', backfaceVisibility: 'hidden', transformStyle: 'preserve-3d' } as any) : undefined;

export function SwipeSurface({ children, style, onSwipeLeft, onSwipeRight, onSwipeDown, threshold = 52, dominance = 1.25 }: Props) {
  const translation = useRef(new Animated.ValueXY()).current;
  const activeAxis = useRef<SwipeAxis | undefined>(undefined);
  const size = useRef({ width: 360, height: 640 });
  const transitioning = useRef(false);

  const settle = useCallback(() => {
    Animated.spring(translation, { toValue: { x: 0, y: 0 }, ...RETURN_SPRING, isInteraction: false }).start(() => { transitioning.current = false; });
  }, [translation]);

  const completeHorizontal = useCallback((direction: -1 | 1, callback: () => void, velocity = 0) => {
    if (transitioning.current) return;
    transitioning.current = true;
    const width = Math.max(260, size.current.width);
    const speed = Math.abs(velocity);
    Animated.timing(translation.x, { toValue: direction * (width + 8), duration: speed >= 1 ? 120 : speed >= .65 ? 140 : 164, easing: PAGE_EASING, useNativeDriver: true, isInteraction: false }).start(({ finished }) => {
      if (!finished) { settle(); return; }
      callback(); softHaptic(); translation.setValue({ x: -direction * width, y: 0 }); transitioning.current = false;
      requestAnimationFrame(() => Animated.spring(translation.x, { toValue: 0, ...ENTRY_SPRING, velocity: direction * Math.min(2, Math.max(.45, speed)), isInteraction: false }).start());
    });
  }, [settle, translation]);

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => {
      if (transitioning.current) return false;
      const absX = Math.abs(gesture.dx), absY = Math.abs(gesture.dy);
      if (absX < 10 && absY < 10) return false;
      activeAxis.current = swipeAxis(gesture.dx, gesture.dy, Boolean(onSwipeLeft || onSwipeRight), Boolean(onSwipeDown), dominance);
      return activeAxis.current !== undefined;
    },
    onPanResponderGrant: () => { translation.stopAnimation(); translation.setValue({ x: 0, y: 0 }); },
    onPanResponderMove: (_, gesture) => {
      if (activeAxis.current === 'horizontal') {
        const unavailable = (gesture.dx < 0 && !onSwipeLeft) || (gesture.dx > 0 && !onSwipeRight);
        translation.setValue({ x: unavailable ? gesture.dx * .16 : gesture.dx, y: 0 });
      }
    },
    onPanResponderRelease: (_, gesture) => {
      const absX = Math.abs(gesture.dx), absY = Math.abs(gesture.dy);
      const horizontal = activeAxis.current === 'horizontal' && absX > absY * dominance;
      const fast = absX >= 18 && Math.abs(gesture.vx) >= .5;
      activeAxis.current = undefined;
      if (horizontal && (absX >= threshold || fast)) {
        if (gesture.dx < 0 && onSwipeLeft) { completeHorizontal(-1, onSwipeLeft, gesture.vx); return; }
        if (gesture.dx > 0 && onSwipeRight) { completeHorizontal(1, onSwipeRight, gesture.vx); return; }
      }
      settle();
    },
    onPanResponderTerminate: () => { activeAxis.current = undefined; settle(); },
    onPanResponderTerminationRequest: () => true,
  }), [completeHorizontal, dominance, onSwipeDown, onSwipeLeft, onSwipeRight, settle, threshold, translation]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0) size.current.width = width; if (height > 0) size.current.height = height;
  }, []);

  return <Animated.View onLayout={onLayout} style={[style, WEB_COMPOSITE, { transform: translation.getTranslateTransform() }]} {...responder.panHandlers}>{children}</Animated.View>;
}
