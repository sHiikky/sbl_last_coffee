// components/loyalty/LoyaltyPath.js
// Карта текущего 10-дневного этапа: ряд нод + соединяющая линия, часть линии
// до последнего completed-дня — фирменный оранжевый, остальное — светло-серое.
// nodes приходят готовыми из loyalty/loyaltySelectors.js (getCurrentLoyaltyPath) —
// компонент не содержит бизнес-правил, только раскладку.
import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import LoyaltyDayNode from './LoyaltyDayNode';
import { colors } from '../../theme/tokens';

const GAP = { compact: 14, full: 22 };

export default function LoyaltyPath({ nodes, size = 'full', scrollable = true }) {
  const gap = GAP[size] || GAP.full;
  const lastCompletedIndex = nodes.reduce((acc, n) => (n.status === 'completed' ? n.index : acc), 0);

  const content = (
    <View style={styles.row}>
      {nodes.map((node, i) => {
        const isLast = i === nodes.length - 1;
        const segmentFilled = node.index <= lastCompletedIndex && !isLast;
        return (
          <React.Fragment key={node.kind === 'reward' ? 'reward' : node.dateKey}>
            <LoyaltyDayNode node={node} size={size} />
            {!isLast && (
              <View
                style={[
                  styles.segment,
                  {
                    width: gap,
                    backgroundColor: segmentFilled ? colors.accent : colors.border,
                  },
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );

  if (!scrollable) return content;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  segment: { height: 2, borderRadius: 1, marginHorizontal: 2 },
});
