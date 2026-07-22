---
title: 마이그레이션 가이드
description: 최신 TCA API로 앱을 업데이트할 때 버전 순서에 따라 확인해야 하는 공식 마이그레이션 가이드를 안내합니다.
---

# 마이그레이션 가이드

원문: [Migration guides](https://swiftpackageindex.com/pointfreeco/swift-composable-architecture/main/documentation/composablearchitecture/migrationguides)

애플리케이션을 최신 The Composable Architecture 버전으로 업데이트하는 방법을 알아봅니다.

## 개요

The Composable Architecture는 계속 발전하며 단순하면서도 강력한 라이브러리가 되도록 개선하고 있습니다. 이 과정에서 기존 API를 더 새로운 API로 지원 중단하는 일이 생길 수 있습니다. 가능한 한 빠르게 최신 API로 코드를 업데이트하는 것을 권장하며, 이 가이드는 그 작업을 돕습니다.

> 중요: 특정 마이그레이션 가이드를 따르기 전에 그보다 앞선 모든 마이그레이션 가이드를 먼저 따랐는지 확인하세요.

## 마이그레이션 순서

아래 순서는 최신 버전에서 이전 버전 순입니다. 실제 마이그레이션은 반드시 오래된 버전부터 차례로 진행하세요.

- [1.25로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.25.md)
- [1.19로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.19.md)
- [1.18로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.18.md)
- [1.17.1로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.17.1.md)
- <a id="migrating-to-17"></a>[1.17로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.17.md)
- [1.16로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.16.md)
- [1.15로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.15.md)
- [1.14로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.14.md)
- [1.13로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.13.md)
- [1.12로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.12.md)
- [1.11로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.11.md)
- [1.10로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.10.md)
- [1.9로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.9.md)
- [1.8로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.8.md)
- [1.7로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.7.md)
- [1.6로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.6.md)
- [1.5로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.5.md)
- [1.4로 마이그레이션하기](https://github.com/pointfreeco/swift-composable-architecture/blob/main/Sources/ComposableArchitecture/Documentation.docc/Articles/MigrationGuides/MigratingTo1.4.md)
