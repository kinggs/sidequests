// How a host moves things between its audio thread and its other thread (ENGINE.md §8).
// The core is called from one thread only; everything that crosses goes through one of these.
// harness/race.cpp runs both under ThreadSanitizer (P6), and the Rack module uses the same
// file, so what the sanitizer checked is what ships.
//
// Each has exactly one writing thread and one reading thread. Neither allocates, locks or
// waits. C++11, standard library only.
//
// SPDX-License-Identifier: MIT
#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>

namespace pi {

// The newest value wins: a snapshot going out, or one coming in to be loaded.
// Three buffers, not two. With two and an index, a reader that is still copying can have its
// buffer written again by the second publish after the one it saw (P6 found this; D43).
// Here each side owns one buffer outright and they swap through the third.
template <class T>
class Latest {
    static const uint8_t FRESH = 4;
    T buf[3];
    std::atomic<uint8_t> mid;
    uint8_t back, front; // the writer's and the reader's own; never shared
    bool any;

public:
    Latest() : buf(), mid(1), back(0), front(2), any(false) {}

    // Writer: fill this, then publish().
    T &write() { return buf[back]; }
    void publish() { back = mid.exchange(uint8_t(back | FRESH), std::memory_order_acq_rel) & 3; }

    // Reader: the newest published value if there is one since the last take(), else null.
    const T *take() {
        if (!(mid.load(std::memory_order_acquire) & FRESH)) return nullptr;
        front = mid.exchange(front, std::memory_order_acq_rel) & 3;
        any = true;
        return &buf[front];
    }
    // Reader: the newest published value, taken now or earlier; null if there never was one.
    const T *latest() {
        take();
        return any ? &buf[front] : nullptr;
    }
};

// Every value arrives, in order: edits on their way to the audio thread.
// A ring of N (a power of two). push() says no when it is full; the caller decides.
template <class T, size_t N>
class Queue {
    T ring[N];
    std::atomic<uint32_t> head, tail; // head: next to read; tail: next to write

public:
    Queue() : ring(), head(0), tail(0) {}

    bool push(const T &v) { // writer
        uint32_t t = tail.load(std::memory_order_relaxed);
        if (t - head.load(std::memory_order_acquire) == N) return false;
        ring[t & (N - 1)] = v;
        tail.store(t + 1, std::memory_order_release);
        return true;
    }
    bool pop(T &v) { // reader
        uint32_t h = head.load(std::memory_order_relaxed);
        if (h == tail.load(std::memory_order_acquire)) return false;
        v = ring[h & (N - 1)];
        head.store(h + 1, std::memory_order_release);
        return true;
    }
};

} // namespace pi
