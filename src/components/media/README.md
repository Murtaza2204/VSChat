Usage notes:

- Use `MessageMediaRenderer` from this folder when rendering messages with `type` in `image|video|audio|document`.
- Integrate visibility with FlatList `onViewableItemsChanged` to pass `visible` boolean to each renderer for lazy loading.
- The components fetch a signed download URL from backend via `src/services/mediaService.ts` and do not cache locally yet.

Example FlatList integration (pseudo):

```
const viewabilityConfig = { itemVisiblePercentThreshold: 50 };
const onViewableItemsChanged = useRef(({ viewableItems }) => { /* map ids to visible state */ });

<FlatList data={messages} renderItem={({item}) => <MessageMediaRenderer message={item} visible={visibleMap[item._id]} />} />
```
