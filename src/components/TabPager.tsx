import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { softHaptic } from './haptics';

type Page = { key: string; content: ReactNode };
type Transition = { from: string; to: string; direction: -1 | 1 };

type Props = {
  activeTab: string;
  pages: Page[];
  style?: StyleProp<ViewStyle>;
  onBeforeChange?: (target: string) => void;
  onChange: (target: string) => void;
};

export type TabPagerHandle = {
  goTo: (target: string) => void;
};

const PAGE_SPRING = { stiffness: 300, damping: 32, mass: 0.9, useNativeDriver: true } as const;
const RETURN_SPRING = { stiffness: 255, damping: 29, mass: 0.92, useNativeDriver: true } as const;

/**
 * A two-pane pager: the outgoing and incoming tab move during the same spring.  Unlike a
 * single translated container, it never leaves an empty frame between the two pages.
 */
export const TabPager = forwardRef<TabPagerHandle, Props>(function TabPager({ activeTab, pages, style, onBeforeChange, onChange }, ref) {
  const translation = useRef(new Animated.Value(0)).current;
  const width = useRef(360);
  const transitionRef = useRef<Transition>();
  const finishing = useRef(false);
  const [transition, setTransition] = useState<Transition>();

  const clear = useCallback(() => {
    translation.setValue(0);
    transitionRef.current = undefined;
    finishing.current = false;
    setTransition(undefined);
  }, [translation]);

  const targetFor = useCallback((from: string, direction: -1 | 1) => {
    const index = pages.findIndex((page) => page.key === from);
    return pages[index + direction]?.key;
  }, [pages]);

  const finish = useCallback((next: Transition, velocity = 0) => {
    if (finishing.current) return;
    finishing.current = true;
    const carriedVelocity = next.direction * Math.min(2.4, Math.max(0.8, Math.abs(velocity)));
    Animated.spring(translation, {
      toValue: next.direction * width.current,
      ...PAGE_SPRING,
      velocity: carriedVelocity,
      isInteraction: false,
    }).start(({ finished }) => {
      if (!finished) { clear(); return; }
      onChange(next.to);
      softHaptic();
      clear();
    });
  }, [clear, onChange, translation]);

  const begin = useCallback((target: string, velocity = 0) => {
    if (finishing.current || transitionRef.current || target === activeTab) return;
    const fromIndex = pages.findIndex((page) => page.key === activeTab);
    const toIndex = pages.findIndex((page) => page.key === target);
    if (fromIndex < 0 || toIndex < 0) return;
    const next: Transition = { from: activeTab, to: target, direction: toIndex > fromIndex ? -1 : 1 };
    onBeforeChange?.(target);
    transitionRef.current = next;
    setTransition(next);
    requestAnimationFrame(() => finish(next, velocity));
  }, [activeTab, finish, onBeforeChange, pages]);

  useImperativeHandle(ref, () => ({ goTo: begin }), [begin]);

  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
    onPanResponderGrant: () => {
      if (finishing.current) return;
      translation.stopAnimation();
      translation.setValue(0);
      transitionRef.current = undefined;
      setTransition(undefined);
    },
    onPanResponderMove: (_, gesture) => {
      if (finishing.current) return;
      const direction: -1 | 1 = gesture.dx < 0 ? -1 : 1;
      let next = transitionRef.current;
      if (!next && Math.abs(gesture.dx) > 1) {
        const target = targetFor(activeTab, direction);
        if (!target) return;
        next = { from: activeTab, to: target, direction };
        onBeforeChange?.(target);
        transitionRef.current = next;
        setTransition(next);
      }
      if (!next || next.direction !== direction) return;
      translation.setValue(gesture.dx);
    },
    onPanResponderRelease: (_, gesture) => {
      const next = transitionRef.current;
      if (!next) return;
      const shouldFinish = Math.abs(gesture.dx) >= 52 || (Math.abs(gesture.dx) >= 18 && Math.abs(gesture.vx) >= 0.5);
      if (shouldFinish) { finish(next, gesture.vx); return; }
      Animated.spring(translation, { toValue: 0, ...RETURN_SPRING, isInteraction: false }).start(clear);
    },
    onPanResponderTerminate: () => {
      if (!transitionRef.current) return;
      Animated.spring(translation, { toValue: 0, ...RETURN_SPRING, isInteraction: false }).start(clear);
    },
    onPanResponderTerminationRequest: () => true,
  }), [activeTab, clear, finish, onBeforeChange, targetFor, translation]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0) width.current = next;
  }, []);

  return <View onLayout={onLayout} style={[styles.viewport, style]} {...responder.panHandlers}>
    {pages.map((page) => {
      const moving = transition && (page.key === transition.from || page.key === transition.to);
      const visible = page.key === activeTab || moving;
      const translateX = transition && page.key === transition.to
        ? Animated.add(translation, -transition.direction * width.current)
        : translation;
      return <Animated.View key={page.key} pointerEvents={!transition && page.key === activeTab ? 'auto' : 'none'} style={[styles.pane, !visible && styles.hidden, moving ? { transform: [{ translateX }] } : undefined]}>
        {page.content}
      </Animated.View>;
    })}
  </View>;
});

const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0, overflow: 'hidden' },
  pane: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  hidden: { opacity: 0 },
});
