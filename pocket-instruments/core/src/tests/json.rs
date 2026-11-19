//! Just enough JSON for fixture format 1: objects, arrays, strings and whole numbers.

#[derive(Debug, Clone)]
pub enum Json {
    Num(u64),
    Str(String),
    Arr(Vec<Json>),
    Obj(Vec<(String, Json)>),
}

impl Json {
    pub fn get(&self, key: &str) -> Option<&Json> {
        match self {
            Json::Obj(fields) => fields.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }
    pub fn num(&self, key: &str) -> u64 {
        match self.get(key) {
            Some(Json::Num(n)) => *n,
            other => panic!("{key}: expected a number, found {other:?}"),
        }
    }
    pub fn num_or(&self, key: &str, default: u64) -> u64 {
        if self.get(key).is_some() { self.num(key) } else { default }
    }
    pub fn str(&self, key: &str) -> &str {
        match self.get(key) {
            Some(Json::Str(s)) => s,
            other => panic!("{key}: expected a string, found {other:?}"),
        }
    }
    pub fn arr(&self, key: &str) -> &[Json] {
        match self.get(key) {
            Some(Json::Arr(a)) => a,
            other => panic!("{key}: expected an array, found {other:?}"),
        }
    }
}

pub fn parse(text: &str) -> Json {
    let mut p = Parser { s: text.as_bytes(), i: 0 };
    let v = p.value();
    p.space();
    assert_eq!(p.i, p.s.len(), "text after the JSON value");
    v
}

struct Parser<'a> {
    s: &'a [u8],
    i: usize,
}

impl Parser<'_> {
    fn space(&mut self) {
        while self.i < self.s.len() && self.s[self.i].is_ascii_whitespace() {
            self.i += 1;
        }
    }
    fn eat(&mut self, c: u8) {
        self.space();
        assert_eq!(self.s[self.i], c, "at byte {}", self.i);
        self.i += 1;
    }
    fn peek(&mut self) -> u8 {
        self.space();
        self.s[self.i]
    }
    fn string(&mut self) -> String {
        self.eat(b'"');
        let mut out = Vec::new();
        loop {
            let c = self.s[self.i];
            self.i += 1;
            match c {
                b'"' => break,
                b'\\' => {
                    let e = self.s[self.i];
                    self.i += 1;
                    out.push(match e {
                        b'n' => b'\n',
                        b't' => b'\t',
                        b'"' | b'\\' | b'/' => e,
                        _ => panic!("escape \\{} is not in format 1", e as char),
                    });
                }
                _ => out.push(c),
            }
        }
        String::from_utf8(out).unwrap()
    }
    fn value(&mut self) -> Json {
        match self.peek() {
            b'{' => {
                self.eat(b'{');
                let mut fields = Vec::new();
                if self.peek() != b'}' {
                    loop {
                        let k = self.string();
                        self.eat(b':');
                        fields.push((k, self.value()));
                        if self.peek() != b',' {
                            break;
                        }
                        self.eat(b',');
                    }
                }
                self.eat(b'}');
                Json::Obj(fields)
            }
            b'[' => {
                self.eat(b'[');
                let mut items = Vec::new();
                if self.peek() != b']' {
                    loop {
                        items.push(self.value());
                        if self.peek() != b',' {
                            break;
                        }
                        self.eat(b',');
                    }
                }
                self.eat(b']');
                Json::Arr(items)
            }
            b'"' => Json::Str(self.string()),
            c if c.is_ascii_digit() => {
                let start = self.i;
                while self.i < self.s.len() && self.s[self.i].is_ascii_digit() {
                    self.i += 1;
                }
                Json::Num(std::str::from_utf8(&self.s[start..self.i]).unwrap().parse().unwrap())
            }
            c => panic!("unexpected {:?} at byte {}", c as char, self.i),
        }
    }
}
