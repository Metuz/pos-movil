import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type DbStatus = { version: number; tables: string[] };

export default function Index() {
  const db = useSQLiteContext();
  const [status, setStatus] = useState<DbStatus | null>(null);

  useEffect(() => {
    async function loadStatus() {
      const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      const tableRows = await db.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      );
      setStatus({
        version: versionRow?.user_version ?? 0,
        tables: tableRows.map((row) => row.name),
      });
    }
    loadStatus();
  }, [db]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>POS móvil</Text>
      {status ? (
        <>
          <Text style={styles.text}>Base local lista (versión {status.version})</Text>
          <Text style={styles.text}>Tablas: {status.tables.join(', ')}</Text>
        </>
      ) : (
        <Text style={styles.text}>Abriendo base local…</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  title: { fontSize: 24, fontWeight: '600' },
  text: { fontSize: 16, textAlign: 'center' },
});
