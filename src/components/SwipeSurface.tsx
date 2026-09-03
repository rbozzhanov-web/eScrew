import { useMemo, type ReactNode } from 'react';
import { PanResponder, View, type StyleProp, type ViewStyle } from 'react-native';
export function SwipeSurface({children,style,onSwipeLeft,onSwipeRight,threshold=52}:{children:ReactNode;style?:StyleProp<ViewStyle>;onSwipeLeft?:()=>void;onSwipeRight?:()=>void;threshold?:number}){
  const responder=useMemo(()=>PanResponder.create({onMoveShouldSetPanResponder:(_,g)=>Math.abs(g.dx)>12&&Math.abs(g.dx)>Math.abs(g.dy)*1.25,onPanResponderRelease:(_,g)=>{if(g.dx<=-threshold)onSwipeLeft?.();else if(g.dx>=threshold)onSwipeRight?.()}}),[onSwipeLeft,onSwipeRight,threshold]);
  return <View style={style} {...responder.panHandlers}>{children}</View>;
}
