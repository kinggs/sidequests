//! CRC-32, the zip one: reflected polynomial 0xEDB88320, all ones in and out. Bit by bit: a
//! snapshot is 312 bytes and a table would be most of the code.

pub fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for &b in bytes {
        crc ^= b as u32;
        let mut i = 0;
        while i < 8 {
            crc = (crc >> 1) ^ (0xEDB8_8320 & (crc & 1).wrapping_neg());
            i += 1;
        }
    }
    !crc
}
