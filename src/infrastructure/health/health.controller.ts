import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthCheckService, TypeOrmHealthIndicator, HealthCheck } from '@nestjs/terminus';
import { SkipThrottle } from '../../common/decorators/skip-throttle.decorator';
import { Public } from '../../modules/auth/presentation/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private db: TypeOrmHealthIndicator,
    ) { }

    @Public()
    @SkipThrottle()
    @Get()
    @HealthCheck()
    @ApiOperation({ summary: 'System health check' })
    @ApiResponse({
        status: 200,
        description: 'System is healthy',
        schema: {
            example: {
                status: 'ok',
                info: {
                    database: {
                        status: 'up',
                    },
                },
                error: {},
                details: {
                    database: {
                        status: 'up',
                    },
                },
            },
        },
    })
    @ApiResponse({
        status: 503,
        description: 'System is unhealthy',
    })
    check() {
        return this.health.check([
            () => this.db.pingCheck('database'),
        ]);
    }
}
