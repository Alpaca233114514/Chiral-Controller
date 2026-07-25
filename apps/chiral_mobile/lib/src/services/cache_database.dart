import 'dart:convert';

import 'package:path/path.dart' as path;
import 'package:sqflite/sqflite.dart';

import '../models/protocol.dart';

class CacheDatabase {
  Database? _database;

  Future<Database> get _db async {
    if (_database != null) return _database!;
    final String root = await getDatabasesPath();
    _database = await openDatabase(
      path.join(root, 'chiral_cache.db'),
      version: 1,
      onCreate: (Database db, int version) {
        return db.execute(
          'CREATE TABLE sessions ('
          'session_id TEXT PRIMARY KEY, '
          'payload TEXT NOT NULL, '
          'updated_at INTEGER NOT NULL'
          ')',
        );
      },
    );
    return _database!;
  }

  Future<List<ChiralSession>> readSessions() async {
    final List<Map<String, Object?>> rows = await (await _db).query(
      'sessions',
      orderBy: 'updated_at DESC',
    );
    return rows
        .map(
          (Map<String, Object?> row) => ChiralSession.fromJson(
            Map<String, dynamic>.from(
              jsonDecode(row['payload']! as String) as Map,
            ),
          ),
        )
        .toList(growable: false);
  }

  Future<void> writeSessions(List<ChiralSession> sessions) async {
    final Database db = await _db;
    await db.transaction((Transaction txn) async {
      await txn.delete('sessions');
      for (final ChiralSession session in sessions) {
        await txn.insert('sessions', <String, Object?>{
          'session_id': session.sessionId,
          'payload': jsonEncode(session.toJson()),
          'updated_at': session.lastUpdated.millisecondsSinceEpoch,
        });
      }
    });
  }

  Future<void> clear() async {
    await (await _db).delete('sessions');
  }
}
