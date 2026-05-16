-- ULID helpers (from scoville/pgsql-ulid, vendored in pgledger)
-- https://github.com/scoville/pgsql-ulid

CREATE OR REPLACE FUNCTION parse_ulid(ulid text) RETURNS bytea AS $$
DECLARE
  bytes bytea = E'\\x00000000 00000000 00000000 00000000';
  v bytea;
  dec bytea = '\x
 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
 00 01 02 03 04 05 06 07 08 09 00 00 00 00 00 00
 00 0A 0B 0C 0D 0E 0F 10 11 00 12 13 00 14 15 00
 16 17 18 19 1A 00 1B 1C 1D 1E 1F 00 00 00 00 00
 00 0A 0B 0C 0D 0E 0F 10 11 00 12 13 00 14 15 00
 16 17 18 19 1A 00 1B 1C 1D 1E 1F 00 00 00 00 00
 ';
BEGIN
  IF NOT ulid ~* '^[0-7][0-9ABCDEFGHJKMNPQRSTVWXYZ]{25}$' THEN
    RAISE EXCEPTION 'Invalid ULID: %', ulid;
  END IF;

  v = ulid::bytea;

  bytes = SET_BYTE(bytes, 0, (GET_BYTE(dec, GET_BYTE(v, 0)) << 5) | GET_BYTE(dec, GET_BYTE(v, 1)));
  bytes = SET_BYTE(bytes, 1, (GET_BYTE(dec, GET_BYTE(v, 2)) << 3) | (GET_BYTE(dec, GET_BYTE(v, 3)) >> 2));
  bytes = SET_BYTE(bytes, 2, (GET_BYTE(dec, GET_BYTE(v, 3)) << 6) | (GET_BYTE(dec, GET_BYTE(v, 4)) << 1) | (GET_BYTE(dec, GET_BYTE(v, 5)) >> 4));
  bytes = SET_BYTE(bytes, 3, (GET_BYTE(dec, GET_BYTE(v, 5)) << 4) | (GET_BYTE(dec, GET_BYTE(v, 6)) >> 1));
  bytes = SET_BYTE(bytes, 4, (GET_BYTE(dec, GET_BYTE(v, 6)) << 7) | (GET_BYTE(dec, GET_BYTE(v, 7)) << 2) | (GET_BYTE(dec, GET_BYTE(v, 8)) >> 3));
  bytes = SET_BYTE(bytes, 5, (GET_BYTE(dec, GET_BYTE(v, 8)) << 5) | GET_BYTE(dec, GET_BYTE(v, 9)));

  bytes = SET_BYTE(bytes, 6, (GET_BYTE(dec, GET_BYTE(v, 10)) << 3) | (GET_BYTE(dec, GET_BYTE(v, 11)) >> 2));
  bytes = SET_BYTE(bytes, 7, (GET_BYTE(dec, GET_BYTE(v, 11)) << 6) | (GET_BYTE(dec, GET_BYTE(v, 12)) << 1) | (GET_BYTE(dec, GET_BYTE(v, 13)) >> 4));
  bytes = SET_BYTE(bytes, 8, (GET_BYTE(dec, GET_BYTE(v, 13)) << 4) | (GET_BYTE(dec, GET_BYTE(v, 14)) >> 1));
  bytes = SET_BYTE(bytes, 9, (GET_BYTE(dec, GET_BYTE(v, 14)) << 7) | (GET_BYTE(dec, GET_BYTE(v, 15)) << 2) | (GET_BYTE(dec, GET_BYTE(v, 16)) >> 3));
  bytes = SET_BYTE(bytes, 10, (GET_BYTE(dec, GET_BYTE(v, 16)) << 5) | GET_BYTE(dec, GET_BYTE(v, 17)));
  bytes = SET_BYTE(bytes, 11, (GET_BYTE(dec, GET_BYTE(v, 18)) << 3) | (GET_BYTE(dec, GET_BYTE(v, 19)) >> 2));
  bytes = SET_BYTE(bytes, 12, (GET_BYTE(dec, GET_BYTE(v, 19)) << 6) | (GET_BYTE(dec, GET_BYTE(v, 20)) << 1) | (GET_BYTE(dec, GET_BYTE(v, 21)) >> 4));
  bytes = SET_BYTE(bytes, 13, (GET_BYTE(dec, GET_BYTE(v, 21)) << 4) | (GET_BYTE(dec, GET_BYTE(v, 22)) >> 1));
  bytes = SET_BYTE(bytes, 14, (GET_BYTE(dec, GET_BYTE(v, 22)) << 7) | (GET_BYTE(dec, GET_BYTE(v, 23)) << 2) | (GET_BYTE(dec, GET_BYTE(v, 24)) >> 3));
  bytes = SET_BYTE(bytes, 15, (GET_BYTE(dec, GET_BYTE(v, 24)) << 5) | GET_BYTE(dec, GET_BYTE(v, 25)));

  RETURN bytes;
END
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION ulid_to_uuid(ulid text) RETURNS uuid AS $$
BEGIN
  RETURN encode(parse_ulid(ulid), 'hex')::uuid;
END
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION format_ulid(bytes bytea) RETURNS text AS $$
DECLARE
  encoding bytea = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  output text = '';
BEGIN
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(bytes, 0) & 224) >> 5));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(bytes, 0) & 31)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(bytes, 1) & 248) >> 3));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(bytes, 1) & 7) << 2) | ((GET_BYTE(bytes, 2) & 192) >> 6)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(bytes, 2) & 62) >> 1));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(bytes, 2) & 1) << 4) | ((GET_BYTE(bytes, 3) & 240) >> 4)));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(bytes, 3) & 15) << 1) | ((GET_BYTE(bytes, 4) & 128) >> 7)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(bytes, 4) & 124) >> 2));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(bytes, 4) & 3) << 3) | ((GET_BYTE(bytes, 5) & 224) >> 5)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(bytes, 5) & 31)));

  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(bytes, 6) & 248) >> 3));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(bytes, 6) & 7) << 2) | ((GET_BYTE(bytes, 7) & 192) >> 6)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(bytes, 7) & 62) >> 1));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(bytes, 7) & 1) << 4) | ((GET_BYTE(bytes, 8) & 240) >> 4)));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(bytes, 8) & 15) << 1) | ((GET_BYTE(bytes, 9) & 128) >> 7)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(bytes, 9) & 124) >> 2));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(bytes, 9) & 3) << 3) | ((GET_BYTE(bytes, 10) & 224) >> 5)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(bytes, 10) & 31)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(bytes, 11) & 248) >> 3));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(bytes, 11) & 7) << 2) | ((GET_BYTE(bytes, 12) & 192) >> 6)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(bytes, 12) & 62) >> 1));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(bytes, 12) & 1) << 4) | ((GET_BYTE(bytes, 13) & 240) >> 4)));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(bytes, 13) & 15) << 1) | ((GET_BYTE(bytes, 14) & 128) >> 7)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(bytes, 14) & 124) >> 2));
  output = output || CHR(GET_BYTE(encoding, ((GET_BYTE(bytes, 14) & 3) << 3) | ((GET_BYTE(bytes, 15) & 224) >> 5)));
  output = output || CHR(GET_BYTE(encoding, (GET_BYTE(bytes, 15) & 31)));

  RETURN output;
END
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION uuid_to_ulid(id uuid) RETURNS text AS $$
BEGIN
  RETURN format_ulid(uuid_send(id));
END
$$ LANGUAGE plpgsql IMMUTABLE;
